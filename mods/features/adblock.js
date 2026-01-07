import { configRead } from '../config.js';
import Chapters from '../ui/chapters.js';
import resolveCommand from '../resolveCommand.js';
import { timelyAction, longPressData, MenuServiceItemRenderer, ShelfRenderer, TileRenderer, ButtonRenderer } from '../ui/ytUI.js';
import { PatchSettings } from '../ui/customYTSettings.js';

/**
 * This is a minimal reimplementation of the following uBlock Origin rule:
 * https://github.com/uBlockOrigin/uAssets/blob/3497eebd440f4871830b9b45af0afc406c6eb593/filters/filters.txt#L116
 *
 * This in turn calls the following snippet:
 * https://github.com/gorhill/uBlock/blob/bfdc81e9e400f7b78b2abc97576c3d7bf3a11a0b/assets/resources/scriptlets.js#L365-L470
 *
 * Seems like for now dropping just the adPlacements is enough for YouTube TV
 */
const origParse = JSON.parse;
JSON.parse = function () {
  const r = origParse.apply(this, arguments);
  const adBlockEnabled = configRead('enableAdBlock');

  if (r.adPlacements && adBlockEnabled) {
    r.adPlacements = [];
  }

  // Also set playerAds to false, just incase.
  if (r.playerAds && adBlockEnabled) {
    r.playerAds = false;
  }

  // Also set adSlots to an empty array, emptying only the adPlacements won't work.
  if (r.adSlots && adBlockEnabled) {
    r.adSlots = [];
  }

  if (r.paidContentOverlay && !configRead('enablePaidPromotionOverlay')) {
    r.paidContentOverlay = null;
  }

  if (r?.streamingData?.adaptiveFormats && configRead('videoPreferredCodec') !== 'any') {
    const preferredCodec = configRead('videoPreferredCodec');
    const hasPreferredCodec = r.streamingData.adaptiveFormats.find(format => format.mimeType.includes(preferredCodec));
    if (hasPreferredCodec) {
      r.streamingData.adaptiveFormats = r.streamingData.adaptiveFormats.filter(format => {
        if (format.mimeType.startsWith('audio/')) return true;
        return format.mimeType.includes(preferredCodec);
      });
    }
  }

  // Drop "masthead" ad from home screen
  if (
    r?.contents?.tvBrowseRenderer?.content?.tvSurfaceContentRenderer?.content
      ?.sectionListRenderer?.contents
  ) {
    if (adBlockEnabled) {
      r.contents.tvBrowseRenderer.content.tvSurfaceContentRenderer.content.sectionListRenderer.contents =
        r.contents.tvBrowseRenderer.content.tvSurfaceContentRenderer.content.sectionListRenderer.contents.filter(
          (elm) => !elm.adSlotRenderer
        );

      for (const shelve of r.contents.tvBrowseRenderer.content.tvSurfaceContentRenderer.content.sectionListRenderer.contents) {
        if (shelve.shelfRenderer) {
          shelve.shelfRenderer.content.horizontalListRenderer.items =
            shelve.shelfRenderer.content.horizontalListRenderer.items.filter(
              (item) => !item.adSlotRenderer
            );
        }
      }
    }

    processShelves(r.contents.tvBrowseRenderer.content.tvSurfaceContentRenderer.content.sectionListRenderer.contents);
  }

  if (r.endscreen && configRead('enableHideEndScreenCards')) {
    r.endscreen = null;
  }

  if (r.messages && Array.isArray(r.messages) && !configRead('enableYouThereRenderer')) {
    r.messages = r.messages.filter(
      (msg) => !msg?.youThereRenderer
    );
  }

  // Remove shorts ads
  if (!Array.isArray(r) && r?.entries && adBlockEnabled) {
    r.entries = r.entries?.filter(
      (elm) => !elm?.command?.reelWatchEndpoint?.adClientParams?.isAd
    );
  }

  // Patch settings

  if (r?.title?.runs) {
    PatchSettings(r);
  }

  // DeArrow Implementation. I think this is the best way to do it. (DOM manipulation would be a pain)

  if (r?.contents?.sectionListRenderer?.contents) {
    processShelves(r.contents.sectionListRenderer.contents);
  }

  if (r?.continuationContents?.sectionListContinuation?.contents) {
    processShelves(r.continuationContents.sectionListContinuation.contents);
  }

  if (r?.continuationContents?.horizontalListContinuation?.items) {
    deArrowify(r.continuationContents.horizontalListContinuation.items);
    hqify(r.continuationContents.horizontalListContinuation.items);
    addLongPress(r.continuationContents.horizontalListContinuation.items);
    r.continuationContents.horizontalListContinuation.items = hideVideo(r.continuationContents.horizontalListContinuation.items);
  }

  if (r?.contents?.tvBrowseRenderer?.content?.tvSecondaryNavRenderer?.sections) {
    for (const section of r.contents.tvBrowseRenderer.content.tvSecondaryNavRenderer.sections) {
      for (const tab of section.tvSecondaryNavSectionRenderer.tabs) {
        processShelves(tab.tabRenderer.content.tvSurfaceContentRenderer.content.sectionListRenderer.contents);
      }
    }
  }

  if (r?.contents?.singleColumnWatchNextResults?.pivot?.sectionListRenderer) {
    processShelves(r.contents.singleColumnWatchNextResults.pivot.sectionListRenderer.contents, false);
    if (window.queuedVideos.videos.length > 0) {
      const queuedVideosClone = window.queuedVideos.videos.slice();
      queuedVideosClone.unshift(TileRenderer(
        'Clear Queue',
        {
          customAction: {
            action: 'CLEAR_QUEUE'
          }
        }));
      r.contents.singleColumnWatchNextResults.pivot.sectionListRenderer.contents.unshift(ShelfRenderer(
        'Queued Videos',
        queuedVideosClone,
        queuedVideosClone.findIndex(v => v.contentId === window.queuedVideos.lastVideoId) !== -1 ?
          queuedVideosClone.findIndex(v => v.contentId === window.queuedVideos.lastVideoId)
          : 0
      ));
    }
  }
  /*
 
  Chapters are disabled due to the API removing description data which was used to generate chapters
 
  if (r?.contents?.singleColumnWatchNextResults?.results?.results?.contents && configRead('enableChapters')) {
    const chapterData = Chapters(r);
    r.frameworkUpdates.entityBatchUpdate.mutations.push(chapterData);
    resolveCommand({
      "clickTrackingParams": "null",
      "loadMarkersCommand": {
        "visibleOnLoadKeys": [
          chapterData.entityKey
        ],
        "entityKeys": [
          chapterData.entityKey
        ]
      }
    });
  }*/

  // Manual SponsorBlock Skips

  if (configRead('sponsorBlockManualSkips').length > 0 && r?.playerOverlays?.playerOverlayRenderer) {
    const manualSkippedSegments = configRead('sponsorBlockManualSkips');
    let timelyActions = [];
    if (window?.sponsorblock?.segments) {
      for (const segment of window.sponsorblock.segments) {
        if (manualSkippedSegments.includes(segment.category)) {
          const timelyActionData = timelyAction(
            `Skip ${segment.category}`,
            'SKIP_NEXT',
            {
              clickTrackingParams: null,
              showEngagementPanelEndpoint: {
                customAction: {
                  action: 'SKIP',
                  parameters: {
                    time: segment.segment[1]
                  }
                }
              }
            },
            segment.segment[0] * 1000,
            segment.segment[1] * 1000 - segment.segment[0] * 1000
          );
          timelyActions.push(timelyActionData);
        }
      }
      r.playerOverlays.playerOverlayRenderer.timelyActionRenderers = timelyActions;
    }
  } else if (r?.playerOverlays?.playerOverlayRenderer) {
    r.playerOverlays.playerOverlayRenderer.timelyActionRenderers = [];
  }

  if (r?.transportControls?.transportControlsRenderer?.promotedActions && configRead('enableSponsorBlockHighlight')) {
    if (window?.sponsorblock?.segments) {
      const category = window.sponsorblock.segments.find(seg => seg.category === 'poi_highlight');
      if (category) {
        r.transportControls.transportControlsRenderer.promotedActions.push({
          type: 'TRANSPORT_CONTROLS_BUTTON_TYPE_SPONSORBLOCK_HIGHLIGHT',
          button: {
            buttonRenderer: ButtonRenderer(
              false,
              'Skip to highlight',
              'SKIP_NEXT',
              {
                clickTrackingParams: null,
                customAction: {
                  action: 'SKIP',
                  parameters: {
                    time: category.segment[0]
                  }
                }
              })
          }
        });
      }
    }
  }

  return r;
};

// Patch JSON.parse to use the custom one
window.JSON.parse = JSON.parse;
for (const key in window._yttv) {
  if (window._yttv[key] && window._yttv[key].JSON && window._yttv[key].JSON.parse) {
    window._yttv[key].JSON.parse = JSON.parse;
  }
}

function processShelves(shelves, shouldAddPreviews = false) {
  if (!Array.isArray(shelves)) return shelves;

  const page = getCurrentPage();
  const hideWatchedEnabled =
    configRead('enableHideWatchedVideos') &&
    configRead('hideWatchedVideosPages')?.includes(page);

  for (const shelve of shelves) {
    /* =========================
     * GRID RENDERER (home, subs)
     * ========================= */
    if (shelve.gridRenderer?.items) {
      let items = shelve.gridRenderer.items;

      deArrowify(items);
      hqify(items);
      addLongPress(items);
      if (shouldAddPreviews) addPreviews(items);

      // Remove Shorts (server-side)
      if (!configRead('enableShorts')) {
        items = items.filter(item => !isShortItem(item));
      }

      // Hide watched videos
      if (hideWatchedEnabled) {
        items = hideVideo(items);
      }

      shelve.gridRenderer.items = items;
    }

    /* =========================
     * RICH GRID (subscriptions, channels)
     * ========================= */
    if (shelve.richShelfRenderer?.content?.richGridRenderer?.contents) {
      let contents = shelve.richShelfRenderer.content.richGridRenderer.contents;

      deArrowify(contents);
      hqify(contents);
      addLongPress(contents);
      if (shouldAddPreviews) addPreviews(contents);

      if (!configRead('enableShorts')) {
        contents = contents.filter(item => !isShortItem(item));
      }

      if (hideWatchedEnabled) {
        contents = hideVideo(contents);
      }

      shelve.richShelfRenderer.content.richGridRenderer.contents = contents;
    }

    /* =========================
     * RICH SECTION (shorts shelves)
     * ========================= */
    if (shelve.richSectionRenderer?.content?.richShelfRenderer) {
      if (!configRead('enableShorts')) {
        // Drop entire shelf if it contains Shorts
        const shelf = shelve.richSectionRenderer.content.richShelfRenderer;
        const contents = shelf?.content?.richGridRenderer?.contents;
        if (Array.isArray(contents) && contents.some(isShortItem)) {
          shelve.richSectionRenderer = null;
        }
      }
    }

    /* =========================
     * VERTICAL LIST (channel pages)
     * ========================= */
    if (shelve.shelfRenderer?.content?.verticalListRenderer?.items) {
      let items = shelve.shelfRenderer.content.verticalListRenderer.items;

      deArrowify(items);
      hqify(items);
      addLongPress(items);
      if (shouldAddPreviews) addPreviews(items);

      if (!configRead('enableShorts')) {
        items = items.filter(item => !isShortItem(item));
      }

      if (hideWatchedEnabled) {
        items = hideVideo(items);
      }

      shelve.shelfRenderer.content.verticalListRenderer.items = items;
    }
  }

  // Remove empty shelves (important to avoid blank rows)
  return shelves.filter(s =>
    s &&
    (
      s.gridRenderer?.items?.length ||
      s.richShelfRenderer?.content?.richGridRenderer?.contents?.length ||
      s.shelfRenderer?.content?.verticalListRenderer?.items?.length
    )
  );
}

function isShortItem(item) {
  if (!item) return false;

  // Explicit Shorts / Reels renderers
  if (
    item.reelItemRenderer ||
    item.richItemRenderer?.content?.reelItemRenderer
  ) {
    return true;
  }

  const video =
    item.videoRenderer ||
    item.compactVideoRenderer ||
    item.gridVideoRenderer ||
    item.richItemRenderer?.content?.videoRenderer;

  if (!video) return false;

  // Shorts badge
  if (video.badges?.some(b =>
    b.metadataBadgeRenderer?.label === 'Shorts'
  )) {
    return true;
  }

  // Shorts overlay
  if (video.thumbnailOverlays?.some(o =>
    o.thumbnailOverlayTimeStatusRenderer?.style === 'SHORTS'
  )) {
    return true;
  }

  // /shorts/ URL
  const url =
    video.navigationEndpoint?.commandMetadata?.webCommandMetadata?.url;
  if (typeof url === 'string' && url.includes('/shorts/')) {
    return true;
  }

  return false;
}

function addPreviews(items) {
  if (!configRead('enablePreviews')) return;
  for (const item of items) {
    if (item.tileRenderer) {
      const watchEndpoint = item.tileRenderer.onSelectCommand;
      if (item.tileRenderer?.onFocusCommand?.playbackEndpoint) continue;
      item.tileRenderer.onFocusCommand = {
        startInlinePlaybackCommand: {
          blockAdoption: true,
          caption: false,
          delayMs: 3000,
          durationMs: 40000,
          muted: false,
          restartPlaybackBeforeSeconds: 10,
          resumeVideo: true,
          playbackEndpoint: watchEndpoint
        }
      };
    }
  }
}

function deArrowify(items) {
  for (const item of items) {
    if (item.adSlotRenderer) {
      const index = items.indexOf(item);
      items.splice(index, 1);
      continue;
    }
    if (!item.tileRenderer) continue;
    if (configRead('enableDeArrow')) {
      const videoID = item.tileRenderer.contentId;
      fetch(`https://sponsor.ajay.app/api/branding?videoID=${videoID}`).then(res => res.json()).then(data => {
        if (data.titles.length > 0) {
          const mostVoted = data.titles.reduce((max, title) => max.votes > title.votes ? max : title);
          item.tileRenderer.metadata.tileMetadataRenderer.title.simpleText = mostVoted.title;
        }

        if (data.thumbnails.length > 0 && configRead('enableDeArrowThumbnails')) {
          const mostVotedThumbnail = data.thumbnails.reduce((max, thumbnail) => max.votes > thumbnail.votes ? max : thumbnail);
          if (mostVotedThumbnail.timestamp) {
            item.tileRenderer.header.tileHeaderRenderer.thumbnail.thumbnails = [
              {
                url: `https://dearrow-thumb.ajay.app/api/v1/getThumbnail?videoID=${videoID}&time=${mostVotedThumbnail.timestamp}`,
                width: 1280,
                height: 640
              }
            ]
          }
        }
      }).catch(() => { });
    }
  }
}


function hqify(items) {
  for (const item of items) {
    if (!item.tileRenderer) continue;
    if (item.tileRenderer.style !== 'TILE_STYLE_YTLR_DEFAULT') continue;
    if (configRead('enableHqThumbnails')) {
      const videoID = item.tileRenderer.onSelectCommand.watchEndpoint.videoId;
      const queryArgs = item.tileRenderer.header.tileHeaderRenderer.thumbnail.thumbnails[0].url.split('?')[1];
      item.tileRenderer.header.tileHeaderRenderer.thumbnail.thumbnails = [
        {
          url: `https://i.ytimg.com/vi/${videoID}/sddefault.jpg${queryArgs ? `?${queryArgs}` : ''}`,
          width: 640,
          height: 480
        }
      ];
    }
  }
}

function addLongPress(items) {
  for (const item of items) {
    if (!item.tileRenderer) continue;
    if (item.tileRenderer.style !== 'TILE_STYLE_YTLR_DEFAULT') continue;
    if (item.tileRenderer.onLongPressCommand) {
      item.tileRenderer.onLongPressCommand.showMenuCommand.menu.menuRenderer.items.push(MenuServiceItemRenderer('Add to Queue', {
        clickTrackingParams: null,
        playlistEditEndpoint: {
          customAction: {
            action: 'ADD_TO_QUEUE',
            parameters: item
          }
        }
      }));
      continue;
    }
    if (!configRead('enableLongPress')) continue;
    const subtitle = item.tileRenderer.metadata.tileMetadataRenderer.lines[0].lineRenderer.items[0].lineItemRenderer.text;
    const data = longPressData({
      videoId: item.tileRenderer.contentId,
      thumbnails: item.tileRenderer.header.tileHeaderRenderer.thumbnail.thumbnails,
      title: item.tileRenderer.metadata.tileMetadataRenderer.title.simpleText,
      subtitle: subtitle.runs ? subtitle.runs[0].text : subtitle.simpleText,
      watchEndpointData: item.tileRenderer.onSelectCommand.watchEndpoint,
      item
    });
    item.tileRenderer.onLongPressCommand = data;
  }
}

function hideVideo(items) {
  if (!configRead('enableHideWatchedVideos')) {
    return items;
  }
  
  if (!Array.isArray(items)) return items;
  
  // Helper: Find progress bar - based on Chrome extension approach
  // === Replace the existing findProgressBar(item) implementation with this ===
  function findProgressBar(item) {
    if (!item) return null;

    const toPercent = (v) => {
      if (typeof v === 'number') return v;
      if (!v) return NaN;
      // strip percent sign and try parse
      const s = String(v).trim().replace('%', '');
      const n = parseFloat(s);
      if (isNaN(n)) return NaN;
      // if value looks like 0..1 scale, convert to 0..100
      if (n > 0 && n <= 1) return n * 100;
      return n;
    };

    // 1) DOM-like (defensive): check for inline progress bars if item has a queryable DOM representation
    try {
      const progressSelectors = [
        '#progress',
        '.ytThumbnailOverlayProgressBarHostWatchedProgressBarSegment',
        '.thumbnail-overlay-resume-playback-progress',
        'ytd-thumbnail-overlay-resume-playback-renderer #progress',
        'ytm-thumbnail-overlay-resume-playback-renderer .thumbnail-overlay-resume-playback-progress'
      ];

      if (item.querySelector) {
        for (const sel of progressSelectors) {
          const el = item.querySelector(sel);
          if (el) {
            // try style.width (e.g. "23%")
            if (el.style && el.style.width) {
              const p = toPercent(el.style.width);
              if (!isNaN(p)) return { percentDurationWatched: p };
            }
            // some renderers expose numeric fields directly as attributes
            const attr = el.getAttribute && el.getAttribute('data-percent');
            if (attr) {
              const p = toPercent(attr);
              if (!isNaN(p)) return { percentDurationWatched: p };
            }
          }
        }
      }
    } catch (e) {
      // defensive: some objects aren't queryable, ignore DOM attempt
    }

    // 2) Structured JSON renderers - inspect common renderer places for resume/playback objects or numeric fields
    const rendererCandidates = [
      item.tileRenderer,
      item.playlistVideoRenderer,
      item.compactVideoRenderer,
      item.gridVideoRenderer,
      item.videoRenderer,
      item.richItemRenderer?.content?.videoRenderer,
      item.richItemRenderer?.content?.reelItemRenderer,
      // some responses use different nesting:
      item.videoWithContextRenderer,
      item.commandVideoRenderer
    ];

    for (const r of rendererCandidates) {
      if (!r) continue;

      // Common overlay arrays
      const overlays = r.thumbnailOverlays || r.header?.tileHeaderRenderer?.thumbnailOverlays || r.thumbnail?.thumbnailOverlays;
      if (Array.isArray(overlays)) {
        for (const o of overlays) {
          // Known resume renderer shape
          const resume = o?.thumbnailOverlayResumePlaybackRenderer || o?.thumbnailOverlayResumePlaybackRenderer?.resumePlaybackPercent || null;
          if (o?.thumbnailOverlayResumePlaybackRenderer) {
            const candidate = o.thumbnailOverlayResumePlaybackRenderer;
            // check a few possible numeric fields
            const percent = toPercent(candidate.percentDurationWatched || candidate.percent || candidate.progressPercent || candidate.resumePlaybackPercent || candidate.width);
            if (!isNaN(percent)) return { percentDurationWatched: percent };
          }
          // Some legacy/other objects may carry width in style properties
          if (o?.style && typeof o.style === 'object' && o.style.width) {
            const p = toPercent(o.style.width);
            if (!isNaN(p)) return { percentDurationWatched: p };
          }
        }
      }

      // Some renderers contain scalar fields describing progress
      const scalarFields = ['percentDurationWatched', 'progressPercent', 'resumePlaybackPercent', 'percentWatched', 'progress'];
      for (const f of scalarFields) {
        if (typeof r[f] !== 'undefined' && r[f] !== null) {
          const p = toPercent(r[f]);
          if (!isNaN(p)) return { percentDurationWatched: p };
        }
      }
    }

    return null;
  }
  
  // Helper: Get current page type
  function getCurrentPage() {
    const hash = location.hash ? location.hash.substring(1) : '';
    const path = location.pathname || '';
    const search = location.search || '';
    const combined = (hash + ' ' + path + ' ' + search).toLowerCase();

    // Channel page detection: /@, /channel/, /c/, /user/
    if (combined.includes('/@') || combined.includes('/channel/') || combined.includes('/c/') || combined.includes('/user/')) return 'channel';
    if (combined.includes('/playlist') || combined.includes('list=')) return 'playlist';
    if (combined.includes('/feed/subscriptions') || combined.includes('subscriptions') || combined.includes('abos')) return 'subscriptions';
    if (combined.includes('/feed/library') || combined.includes('library') || combined.includes('mediathek')) return 'library';
    if (combined.includes('/results') || combined.includes('/search') || combined.includes('suche')) return 'search';
    if (combined.includes('music')) return 'music';
    if (combined.includes('gaming')) return 'gaming';
    if (combined.includes('more')) return 'more';
    if (combined === '' || combined === '/' || combined.includes('/home') || combined.includes('browse')) return 'home';
    if (combined.includes('/watch')) return 'watch';

    return 'other';
  }
  
  const currentPage = getCurrentPage();
  const configPages = configRead('hideWatchedVideosPages') || [];
  const threshold = Number(configRead('hideWatchedVideosThreshold') || 0);
  
  // Check if hiding is enabled for this page
  const shouldHideOnThisPage = configPages.length === 0 || configPages.includes(currentPage);
  
  if (!shouldHideOnThisPage) {
    return items;
  }
  
  // Playlist-specific check
  if (currentPage === 'playlist' && !configRead('enableHideWatchedInPlaylists')) {
    return items;
  }
  
  return items.filter(item => {
    if (!item) return false;
    
    const progressBar = findProgressBar(item);
    if (!progressBar) return true; // No progress = keep it
    
    const percentWatched = Number(progressBar.percentDurationWatched || 0);
    return percentWatched <= threshold;
  });
}