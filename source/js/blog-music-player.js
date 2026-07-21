(function () {
  const config = window.BLOG_MUSIC_CONFIG;

  if (!config || !config.enabled) {
    return;
  }

  const playlistData = window.BLOG_MUSIC_PLAYLIST;
  if (!Array.isArray(playlistData) || !playlistData.length) {
    return;
  }

  const storageNamespace = config.storageNamespace || "storm-blog-music";
  const storageKeys = {
    autoplaySeen: `${storageNamespace}:autoplay-seen`,
    collapsed: `${storageNamespace}:collapsed`,
    hidden: `${storageNamespace}:hidden`,
    muted: `${storageNamespace}:muted`,
    volume: `${storageNamespace}:volume`,
    dockX: `${storageNamespace}:dock-x`,
    dockY: `${storageNamespace}:dock-y`,
    lyricsOpen: `${storageNamespace}:lyrics-open`,
    lyricsMode: `${storageNamespace}:lyrics-mode`,
    playlistOpen: `${storageNamespace}:playlist-open`,
    currentTrack: `${storageNamespace}:current-track`,
    currentTime: `${storageNamespace}:current-time`
  };

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const rememberPosition = config.rememberPosition !== false;
  const compactMode = config.compactMode !== false;
  const uiScale = clamp(Number(config.uiScale ?? 1), 0.78, 1.08);
  const lyricsAutoOpenMinWidth = Number(config.lyricsAutoOpenMinWidth ?? 1320);
  const compactCollapseWidth = Number(config.compactCollapseWidth ?? 1680);
  const defaultVolume = clamp(Number(config.defaultVolume ?? 0.18), 0, 1);
  const defaultLyricsOpen = window.innerWidth >= lyricsAutoOpenMinWidth;

  const readStorage = (key, fallback = null) => {
    try {
      const value = window.localStorage.getItem(key);
      return value === null ? fallback : value;
    } catch (error) {
      return fallback;
    }
  };

  const writeStorage = (key, value) => {
    try {
      window.localStorage.setItem(key, String(value));
    } catch (error) {
      return;
    }
  };

  const readBoolean = (key, fallback = false) => {
    const value = readStorage(key, null);
    return value === null ? fallback : value === "true";
  };

  const readNumber = (key) => {
    const value = Number(readStorage(key, Number.NaN));
    return Number.isFinite(value) ? value : null;
  };

  const formatTime = (seconds) => {
    if (!Number.isFinite(seconds) || seconds < 0) {
      return "0:00";
    }

    const totalSeconds = Math.floor(seconds);
    const minutes = Math.floor(totalSeconds / 60);
    const remainSeconds = totalSeconds % 60;
    return `${minutes}:${String(remainSeconds).padStart(2, "0")}`;
  };

  const parseLrc = (text) => {
    const rawLines = [];

    const parseTimestamp = (match) => {
      const minutes = Number(match[1]);
      const seconds = Number(match[2]);
      const fraction = match[3] || "0";
      const milliseconds = fraction.length === 3
        ? Number(fraction)
        : fraction.length === 2
          ? Number(fraction) * 10
          : Number(fraction) * 100;
      return minutes * 60 + seconds + milliseconds / 1000;
    };

    text.split(/\r?\n/).forEach((rawLine) => {
      const matches = [...rawLine.matchAll(/\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\]/g)];
      if (!matches.length) {
        return;
      }

      const times = matches.map(parseTimestamp);
      if (!times.length) {
        return;
      }

      const content = rawLine
        .replace(/\[[^\]]+\]/g, "")
        .replace(/\s+/g, " ")
        .trim();

      rawLines.push({
        start: times[0],
        end: times.length > 1 ? times[times.length - 1] : null,
        text: content,
        tagCount: times.length
      });
    });

    if (!rawLines.length) {
      return [];
    }

    rawLines.sort((a, b) => a.start - b.start || b.tagCount - a.tagCount);

    const startTolerance = 0.14;

    rawLines.forEach((line, index) => {
      // 双语/逐字 LRC 常有多行共享起始时间；只用下一组时间来限制本行结束时间。
      const nextLine = rawLines.slice(index + 1)
        .find((candidate) => candidate.start - line.start > startTolerance);
      const fallbackEnd = nextLine
        ? Math.max(line.start + 0.08, nextLine.start - 0.04)
        : line.start + 4.5;

      if (!Number.isFinite(line.end) || line.end <= line.start + 0.02) {
        line.end = fallbackEnd;
        return;
      }

      line.end = Math.max(line.start + 0.06, line.end);
      if (nextLine && line.end > nextLine.start - 0.02) {
        line.end = Math.max(line.start + 0.06, nextLine.start - 0.02);
      }
    });

    const groupedLines = [];
    rawLines.forEach((line) => {
      const lastGroup = groupedLines[groupedLines.length - 1];
      if (!lastGroup || Math.abs(line.start - lastGroup.start) > startTolerance) {
        groupedLines.push({
          start: line.start,
          entries: [line]
        });
      } else {
        lastGroup.entries.push(line);
      }
    });

    const mergedLines = groupedLines.map((group, index) => {
      const nextGroup = groupedLines[index + 1];
      const richEntries = group.entries.filter((entry) => entry.tagCount >= 3 && entry.text);
      const timingEntries = richEntries.length
        ? richEntries
        : group.entries.filter((entry) => entry.text);

      let end = timingEntries.length
        ? Math.max(...timingEntries.map((entry) => entry.end))
        : Math.max(...group.entries.map((entry) => entry.end));

      if (!Number.isFinite(end) || end <= group.start) {
        end = nextGroup ? Math.max(group.start + 0.08, nextGroup.start - 0.04) : group.start + 4.5;
      }

      if (nextGroup && end > nextGroup.start - 0.02) {
        end = Math.max(group.start + 0.06, nextGroup.start - 0.02);
      }

      const texts = [];
      group.entries.forEach((entry) => {
        if (!entry.text) {
          return;
        }

        if (!texts.includes(entry.text)) {
          texts.push(entry.text);
        }
      });

      return {
        start: group.start,
        end,
        original: texts[0] || "",
        translation: texts[1] || ""
      };
    }).filter((line) => line.original || line.translation);

    mergedLines.sort((a, b) => a.start - b.start);
    mergedLines.forEach((line, index) => {
      const nextLine = mergedLines[index + 1];
      if (nextLine && line.end > nextLine.start - 0.02) {
        line.end = Math.max(line.start + 0.06, nextLine.start - 0.02);
      }
    });

    return mergedLines;
  };

  const formatLine = (line) => {
    if (!line) {
      return "";
    }

    switch (state.lyricsMode) {
      case "original":
        return line.original || "";
      case "translation":
        return line.translation || line.original || "";
      case "dual":
      default:
        return line.translation
          ? `${line.original}\n${line.translation}`
          : (line.original || "");
    }
  };

  const icons = {
    play:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 6.5v11l9-5.5z" fill="currentColor"></path></svg>',
    pause:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h3v14H7zm7 0h3v14h-3z" fill="currentColor"></path></svg>',
    mute:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 9v6h4l5 4V5L9 9zm10.5 3l3.5 3.5-1.5 1.5L14 13.5 10.5 17 9 15.5l3.5-3.5L9 8.5 10.5 7 14 10.5 17.5 7 19 8.5z" fill="currentColor"></path></svg>',
    volume:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 9v6h4l5 4V5L9 9zm11.5 3a4.5 4.5 0 0 0-2.2-3.9v7.8a4.5 4.5 0 0 0 2.2-3.9zm0-7a11 11 0 0 1 0 14l-1.4-1.4a9 9 0 0 0 0-11.2z" fill="currentColor"></path></svg>',
    collapse:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 14l5-5 5 5z" fill="currentColor"></path></svg>',
    close:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.4 5 5 6.4 10.6 12 5 17.6 6.4 19l5.6-5.6 5.6 5.6 1.4-1.4-5.6-5.6L19 6.4 17.6 5 12 10.6z" fill="currentColor"></path></svg>',
    note:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17 3v11.2a3.8 3.8 0 1 1-2-3.4V7h-6v9.2a3.8 3.8 0 1 1-2-3.4V5a2 2 0 0 1 2-2z" fill="currentColor"></path></svg>',
    lyrics:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 5h12v2H6zm0 5h12v2H6zm0 5h8v2H6z" fill="currentColor"></path><path d="M18 12.2V7h-2v7.2a2.8 2.8 0 1 0 2 0z" fill="currentColor" opacity=".82"></path></svg>',
    drag:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3Zm6 0a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3ZM9 10.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3Zm6 0a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3ZM9 15a1.5 1.5 0 1 1 0 3A1.5 1.5 0 0 1 9 15Zm6 0a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3Z" fill="currentColor"></path></svg>',
    prev:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" fill="currentColor"></path></svg>',
    next:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 6h2v12h-2zM6 6l8.5 6L6 18z" fill="currentColor"></path></svg>',
    list:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h2v2H4zm4 0h12v2H8zM4 11h2v2H4zm4 0h12v2H8zm-4 5h2v2H4zm4 0h12v2H8z" fill="currentColor"></path></svg>'
  };

  const initialLyricsOpen = (() => {
    let value = readBoolean(storageKeys.lyricsOpen, defaultLyricsOpen);
    if (compactMode && window.innerWidth < compactCollapseWidth) {
      value = false;
    }
    return value;
  })();

  const state = {
    audio: new Audio(),
    root: null,
    panel: null,
    panelShell: null,
    launcher: null,
    launcherState: null,
    playButton: null,
    muteButton: null,
    collapseButton: null,
    closeButton: null,
    lyricsToggleButton: null,
    dragHandle: null,
    progressTrack: null,
    volumeInput: null,
    currentTime: null,
    durationTime: null,
    title: null,
    artist: null,
    ambience: null,
    hint: null,
    sourceLink: null,
    status: null,
    cover: null,
    lyricsPane: null,
    lyricsList: null,
    lyricCurrent: null,
    lyricNext: null,
    autoplaySeen: readBoolean(storageKeys.autoplaySeen, false),
    collapsed: readBoolean(storageKeys.collapsed, false),
    hidden: readBoolean(storageKeys.hidden, false),
    muted: readBoolean(storageKeys.muted, false),
    lyricsOpen: initialLyricsOpen,
    compactMode,
    desiredVolume: clamp(Number(readStorage(storageKeys.volume, defaultVolume)), 0, 1),
    fadeTimer: null,
    autoWarmMuted: false,
    unlockListenersBound: false,
    userDismissed: false,
    lyricsLines: [],
    lyricItems: [],
    activeLyricIndex: -1,
    revealLyricsOnNextRender: initialLyricsOpen,
    lyricsMessage: "歌单正在载入。",
    position: {
      x: rememberPosition ? readNumber(storageKeys.dockX) : null,
      y: rememberPosition ? readNumber(storageKeys.dockY) : null
    },
    drag: {
      active: false,
      pointerId: null,
      startPointerX: 0,
      startPointerY: 0,
      startX: 0,
      startY: 0,
      moved: false,
      suppressClick: false
    },
    seek: {
      active: false,
      previewTime: null,
      pointerId: null
    },
    playlist: playlistData,
    currentIndex: 0,
    pendingRestoreTime: null,
    lastPersistedSecond: -1,
    shouldBePlaying: false,
    lyricsMode: (() => {
      const stored = readStorage(storageKeys.lyricsMode, null);
      return stored === "original" || stored === "translation" || stored === "dual" ? stored : "dual";
    })(),
    lyricsModeUserSet: readStorage(storageKeys.lyricsMode, null) !== null,
    playlistOpen: readBoolean(storageKeys.playlistOpen, false),
    retryTimer: null,
    retryCount: 0,
    lyricsAbortController: null,
    badge: null,
    playlistList: null,
    playlistToggleButton: null,
    prevButton: null,
    nextButton: null,
    lyricsModeButtons: []
  };

  if (state.hidden) {
    state.collapsed = true;
  }

  state.audio.preload = "metadata";
  state.audio.muted = state.muted;
  state.audio.volume = state.muted ? 0 : state.desiredVolume;

  const stopFade = () => {
    if (state.fadeTimer) {
      window.clearInterval(state.fadeTimer);
      state.fadeTimer = null;
    }
  };

  const setStatus = (message, tone = "normal") => {
    if (!state.status) {
      return;
    }

    state.status.textContent = message;
    state.status.dataset.tone = tone;
  };

  const persistViewState = () => {
    writeStorage(storageKeys.collapsed, state.collapsed);
    writeStorage(storageKeys.hidden, state.hidden);
  };

  const persistLyricsState = () => {
    writeStorage(storageKeys.lyricsOpen, state.lyricsOpen);
  };

  const persistPosition = () => {
    if (!rememberPosition || state.position.x === null || state.position.y === null) {
      return;
    }

    writeStorage(storageKeys.dockX, state.position.x);
    writeStorage(storageKeys.dockY, state.position.y);
  };

  const persistPlaybackState = (force = false) => {
    const currentSecond = Number.isFinite(state.audio.currentTime)
      ? Math.max(0, Math.floor(state.audio.currentTime))
      : 0;

    if (!force && currentSecond === state.lastPersistedSecond) {
      return;
    }

    state.lastPersistedSecond = currentSecond;
    writeStorage(storageKeys.currentTrack, state.currentIndex);
    writeStorage(storageKeys.currentTime, currentSecond);
  };

  const restorePlaybackSelection = () => {
    const storedIndex = readNumber(storageKeys.currentTrack);
    const storedTime = readNumber(storageKeys.currentTime);
    const maxIndex = Math.max(0, state.playlist.length - 1);

    return {
      index: storedIndex === null ? 0 : clamp(Math.round(storedIndex), 0, maxIndex),
      time: storedTime === null ? null : Math.max(0, storedTime)
    };
  };

  const updateMediaSession = () => {
    if (!("mediaSession" in navigator)) {
      return;
    }

    const track = state.playlist && state.playlist[state.currentIndex];
    if (!track) {
      return;
    }

    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: track.title || track.file || "博客音乐",
        artist: track.artist || "Storm Talia",
        album: track.subtitle || "Storm's Storehouse",
        artwork: track.cover ? [{ src: track.cover }] : []
      });
    } catch (_) {
      // 不支持 MediaMetadata 的旧浏览器继续使用基础播放器。
    }
  };

  const playbackChannel = typeof window.BroadcastChannel === "function"
    ? new BroadcastChannel(`${storageNamespace}:playback`)
    : null;

  if (playbackChannel) {
    playbackChannel.addEventListener("message", (event) => {
      if (!event.data || event.data.type !== "playing" || !isPlaying()) {
        return;
      }

      pauseMusic("音乐已在另一个标签页播放，本页已暂停。");
    });
  }

  const isPlaying = () => !state.audio.paused && !state.audio.ended;

  const setSliderFill = (input, value) => {
    if (!input) {
      return;
    }

    input.style.setProperty("--value", String(clamp(value, 0, 100)));
  };

  const fadeTo = (targetVolume) => {
    stopFade();

    const finalVolume = clamp(targetVolume, 0, 1);
    if (state.audio.muted) {
      state.audio.volume = 0;
      return;
    }

    const duration = Number(config.fadeInDuration ?? 1400);
    const steps = Math.max(12, Math.floor(duration / 80));
    const stepDelta = (finalVolume - state.audio.volume) / steps;
    let currentStep = 0;

    state.fadeTimer = window.setInterval(() => {
      currentStep += 1;
      const nextVolume = currentStep >= steps ? finalVolume : state.audio.volume + stepDelta;
      state.audio.volume = clamp(nextVolume, 0, 1);
      updateVolumeUI();

      if (currentStep >= steps) {
        stopFade();
      }
    }, duration / steps);
  };

  const getViewportPosition = () => {
    if (!state.root) {
      return { margin: 12, maxX: 12, maxY: 12 };
    }

    const rect = state.root.getBoundingClientRect();
    const margin = 12;
    const maxX = Math.max(margin, window.innerWidth - rect.width - margin);
    const maxY = Math.max(margin, window.innerHeight - rect.height - margin);

    return { margin, maxX, maxY };
  };

  const applyPosition = (x, y, persist = true) => {
    if (!state.root) {
      return;
    }

    const { margin, maxX, maxY } = getViewportPosition();
    const nextX = clamp(Math.round(x), margin, maxX);
    const nextY = clamp(Math.round(y), margin, maxY);

    state.position.x = nextX;
    state.position.y = nextY;
    state.root.style.left = `${nextX}px`;
    state.root.style.top = `${nextY}px`;

    if (persist) {
      persistPosition();
    }
  };

  const syncPositionWithinViewport = () => {
    if (!state.root) {
      return;
    }

    if (state.position.x === null || state.position.y === null) {
      const rect = state.root.getBoundingClientRect();
      applyPosition(
        window.innerWidth - rect.width - 24,
        window.innerHeight - rect.height - 24,
        false
      );
      return;
    }

    applyPosition(state.position.x, state.position.y, false);
  };

  const updateLauncher = () => {
    if (!state.launcher) {
      return;
    }

    const openLabel = state.collapsed || state.hidden ? "展开音乐播放器" : "收起音乐播放器";
    const stateLabel = isPlaying()
      ? (state.autoWarmMuted ? "WARMING" : "ON AIR")
      : (state.hidden ? "HIDDEN" : "STANDBY");

    state.launcher.dataset.playing = String(isPlaying());
    state.launcher.setAttribute("aria-label", openLabel);
    state.launcher.setAttribute("title", openLabel);

    if (state.launcherState) {
      state.launcherState.textContent = stateLabel;
    }
  };

  const updatePlayButton = () => {
    if (!state.playButton) {
      return;
    }

    const shouldShowUnmute = isPlaying() && state.autoWarmMuted && state.audio.muted;
    state.playButton.innerHTML = shouldShowUnmute ? icons.volume : (isPlaying() ? icons.pause : icons.play);
    state.playButton.setAttribute(
      "aria-label",
      shouldShowUnmute ? "恢复声音" : (isPlaying() ? "暂停音乐" : "播放音乐")
    );
  };

  const updateMuteButton = () => {
    if (!state.muteButton) {
      return;
    }

    const shouldShowWarm = state.autoWarmMuted && isPlaying();
    state.muteButton.innerHTML = shouldShowWarm ? icons.volume : (state.audio.muted ? icons.mute : icons.volume);
    state.muteButton.setAttribute(
      "aria-label",
      shouldShowWarm ? "恢复声音" : (state.audio.muted ? "取消静音" : "静音")
    );
  };

  const updateProgressUI = () => {
    if (!state.progressTrack || !state.currentTime || !state.durationTime) {
      return;
    }

    const duration = Number.isFinite(state.audio.duration) ? state.audio.duration : 0;
    const currentTime = state.seek.active && Number.isFinite(state.seek.previewTime)
      ? state.seek.previewTime
      : state.audio.currentTime;
    const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

    setSliderFill(state.progressTrack, progress);
    state.progressTrack.setAttribute("aria-valuenow", String(Math.round(progress)));
    state.progressTrack.setAttribute(
      "aria-valuetext",
      duration > 0 ? `${formatTime(currentTime)} / ${formatTime(duration)}` : "0:00 / 0:00"
    );
    state.currentTime.textContent = formatTime(currentTime);
    state.durationTime.textContent = formatTime(duration);
  };

  const updateVolumeUI = () => {
    if (!state.volumeInput) {
      return;
    }

    const volumeValue = state.audio.muted ? 0 : state.desiredVolume;
    const percent = Math.round(volumeValue * 100);
    state.volumeInput.value = String(percent);
    setSliderFill(state.volumeInput, percent);
    updateMuteButton();
  };

  const applySeekTime = (nextTime, forceLyricSync = false) => {
    if (!Number.isFinite(nextTime) || !Number.isFinite(state.audio.duration) || state.audio.duration <= 0) {
      return false;
    }

    const safeTime = clamp(nextTime, 0, state.audio.duration);
    state.seek.previewTime = state.seek.active ? safeTime : null;
    state.audio.currentTime = safeTime;
    updateProgressUI();
    syncLyrics(forceLyricSync);
    return true;
  };

  const applySeekPercent = (percent, forceLyricSync = false) => {
    if (!Number.isFinite(percent) || !Number.isFinite(state.audio.duration) || state.audio.duration <= 0) {
      return false;
    }

    const safePercent = clamp(percent, 0, 1);
    return applySeekTime(state.audio.duration * safePercent, forceLyricSync);
  };

  const beginSeek = (pointerId = null) => {
    state.seek.active = true;
    state.seek.pointerId = pointerId;
    state.seek.previewTime = Number.isFinite(state.audio.currentTime) ? state.audio.currentTime : 0;
    updateProgressUI();
  };

  const getPointerSeekPercent = (clientX) => {
    if (!state.progressTrack || !Number.isFinite(state.audio.duration) || state.audio.duration <= 0) {
      return null;
    }

    const rect = state.progressTrack.getBoundingClientRect();
    if (rect.width <= 0) {
      return null;
    }

    const numericClientX = Number(clientX);
    if (!Number.isFinite(numericClientX)) {
      return null;
    }

    return clamp((numericClientX - rect.left) / rect.width, 0, 1);
  };

  const applySeekFromPointer = (clientX) => {
    const percent = getPointerSeekPercent(clientX);
    if (percent === null) {
      return false;
    }

    return applySeekPercent(percent, true);
  };

  const handleProgressPointerDown = (event) => {
    if (event.pointerType === "mouse" && event.button !== 0) {
      return;
    }

    beginSeek(event.pointerId);

    const didSeek = applySeekFromPointer(event.clientX);
    if (!didSeek) {
      state.seek.active = false;
      state.seek.pointerId = null;
      state.seek.previewTime = null;
      return;
    }

    if (typeof state.progressTrack.setPointerCapture === "function") {
      state.progressTrack.setPointerCapture(event.pointerId);
    }
    event.preventDefault();
  };

  const handleProgressPointerMove = (event) => {
    if (!state.seek.active || state.seek.pointerId !== event.pointerId) {
      return;
    }

    applySeekFromPointer(event.clientX);
  };

  const endSeek = (pointerId = state.seek.pointerId) => {
    if (!state.seek.active) {
      return;
    }

    if (
      pointerId !== null
      && state.progressTrack
      && typeof state.progressTrack.hasPointerCapture === "function"
      && state.progressTrack.hasPointerCapture(pointerId)
      && typeof state.progressTrack.releasePointerCapture === "function"
    ) {
      state.progressTrack.releasePointerCapture(pointerId);
    }

    state.seek.active = false;
    state.seek.previewTime = null;
    state.seek.pointerId = null;
    updateProgressUI();
    syncLyrics(true);
  };

  const handleProgressPointerUp = (event) => {
    if (!state.seek.active || state.seek.pointerId !== event.pointerId) {
      return;
    }

    applySeekFromPointer(event.clientX);
    endSeek(event.pointerId);
  };

  const handleProgressPointerCancel = (event) => {
    if (!state.seek.active || state.seek.pointerId !== event.pointerId) {
      return;
    }

    endSeek(event.pointerId);
  };

  const handleProgressKeydown = (event) => {
    if (!Number.isFinite(state.audio.duration) || state.audio.duration <= 0) {
      return;
    }

    const shortStep = 5;
    const longStep = 12;
    let nextTime = null;

    switch (event.key) {
      case "ArrowLeft":
      case "ArrowDown":
        nextTime = state.audio.currentTime - shortStep;
        break;
      case "ArrowRight":
      case "ArrowUp":
        nextTime = state.audio.currentTime + shortStep;
        break;
      case "PageDown":
        nextTime = state.audio.currentTime - longStep;
        break;
      case "PageUp":
        nextTime = state.audio.currentTime + longStep;
        break;
      case "Home":
        nextTime = 0;
        break;
      case "End":
        nextTime = state.audio.duration;
        break;
      default:
        return;
    }

    event.preventDefault();
    applySeekTime(nextTime, true);
  };

  const setLyricSpotlight = (current, next) => {
    if (state.lyricCurrent) {
      state.lyricCurrent.textContent = current;
    }

    if (state.lyricNext) {
      state.lyricNext.textContent = next;
    }
  };

  const syncLyricsListScroll = (activeItem, force = false) => {
    if (!state.lyricsList || !activeItem) {
      return;
    }

    const list = state.lyricsList;
    const maxScrollTop = Math.max(list.scrollHeight - list.clientHeight, 0);
    if (maxScrollTop <= 0) {
      return;
    }

    const itemTop = activeItem.offsetTop;
    const itemBottom = itemTop + activeItem.offsetHeight;
    const viewTop = list.scrollTop;
    const viewBottom = viewTop + list.clientHeight;
    const viewportPadding = Math.max(12, Math.round(list.clientHeight * 0.16));
    const targetTop = clamp(
      itemTop - ((list.clientHeight - activeItem.offsetHeight) / 2),
      0,
      maxScrollTop
    );

    const comfortablyVisible = itemTop >= viewTop + viewportPadding && itemBottom <= viewBottom - viewportPadding;
    if (!force && comfortablyVisible) {
      return;
    }

    list.scrollTo({
      top: targetTop,
      behavior: force ? "auto" : "smooth"
    });
  };

  const revealLyricsPane = (force = false) => {
    if (!state.panelShell || !state.lyricsPane || !state.lyricsOpen) {
      return;
    }

    const shell = state.panelShell;
    const pane = state.lyricsPane;
    const maxScrollTop = Math.max(shell.scrollHeight - shell.clientHeight, 0);
    if (maxScrollTop <= 0) {
      return;
    }

    const shellRect = shell.getBoundingClientRect();
    const paneRect = pane.getBoundingClientRect();
    const currentTop = shell.scrollTop;
    const targetTop = clamp(
      currentTop + (paneRect.top - shellRect.top) - 8,
      0,
      maxScrollTop
    );
    const viewTop = currentTop;
    const viewBottom = viewTop + shell.clientHeight;
    const paneTop = currentTop + (paneRect.top - shellRect.top);
    const paneBottom = currentTop + (paneRect.bottom - shellRect.top);
    const comfortablyVisible = paneTop >= viewTop + 8 && paneBottom <= viewBottom - 8;

    if (!force && comfortablyVisible) {
      return;
    }

    shell.scrollTo({
      top: targetTop,
      behavior: "smooth"
    });
  };

  const updateHint = () => {
    if (!state.hint) {
      return;
    }

    if (state.autoWarmMuted && isPlaying()) {
      state.hint.textContent = "浏览器已静音预热，点播放键可恢复声音。";
      return;
    }

    if (state.lyricsLines.length) {
      state.hint.textContent = "右侧歌词来自本地 LRC 文件，点击任意一句可跳转到对应时间。";
      return;
    }

    const track = state.playlist && state.playlist[state.currentIndex];
    if (track && track.lyrics) {
      state.hint.textContent = "歌词文件正在载入，稍后这里会自动滚动显示。";
      return;
    }

    state.hint.textContent = "拖动左侧唱片或顶部六点手柄，都能重新摆放播放器。";
  };

  const updateLyricsToggle = () => {
    if (!state.lyricsToggleButton) {
      return;
    }

    state.lyricsToggleButton.setAttribute(
      "aria-label",
      state.lyricsOpen ? "收起歌词面板" : "展开歌词面板"
    );
    state.lyricsToggleButton.setAttribute("aria-pressed", String(state.lyricsOpen));
    state.lyricsToggleButton.setAttribute(
      "title",
      state.lyricsOpen ? "Hide lyrics panel" : "Show lyrics panel"
    );
  };

  const syncLyrics = (force = false) => {
    const lines = state.lyricsLines;

    if (!lines.length) {
      setLyricSpotlight(
        state.lyricsMessage,
        "以后把正式歌词写进本地 .lrc 文件，这里会自动跟着播放进度变化。"
      );
      return;
    }

    if (state.seek.active && !force) {
      return;
    }

    const currentTime = state.audio.currentTime + 0.02;
    let activeIndex = -1;

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      if (currentTime < line.start) {
        break;
      }

      if (currentTime >= line.start && currentTime < line.end) {
        activeIndex = index;
        break;
      }
    }

    if (!force && activeIndex === state.activeLyricIndex) {
      return;
    }

    state.activeLyricIndex = activeIndex;

    state.lyricItems.forEach((item, index) => {
      item.classList.toggle("is-active", index === activeIndex);
      item.classList.toggle("is-past", index !== activeIndex && currentTime >= lines[index].end);
    });

    if (activeIndex < 0) {
      const upcomingLine = lines.find((line) => line.start > currentTime);
      setLyricSpotlight("", upcomingLine ? formatLine(upcomingLine) : "");
      return;
    }

    const activeLine = lines[activeIndex];
    const nextLine = lines.slice(activeIndex + 1).find((line) => line.original || line.translation);

    setLyricSpotlight(
      formatLine(activeLine),
      nextLine ? formatLine(nextLine) : "这一段旋律会继续陪你阅读，循环时歌词会重新回到开头。"
    );

    const activeItem = state.lyricItems[activeIndex];
    if (activeItem) {
      syncLyricsListScroll(activeItem, force);
    }
  };

  const renderLyrics = () => {
    if (!state.lyricsList) {
      return;
    }

    state.lyricsList.innerHTML = "";
    state.lyricItems = [];
    state.activeLyricIndex = -1;

    if (!state.lyricsLines.length) {
      const empty = document.createElement("div");
      empty.className = "music-player__lyric-empty";
      empty.textContent = state.lyricsMessage;
      state.lyricsList.appendChild(empty);
      setLyricSpotlight(
        state.lyricsMessage,
        "以后把正式歌词写进本地 .lrc 文件，这里就会变成时序高亮歌词。"
      );
      return;
    }

    const fragment = document.createDocumentFragment();

    state.lyricsLines.forEach((line, index) => {
      const item = document.createElement("button");
      item.className = "music-player__lyric-line";
      item.type = "button";
      item.textContent = formatLine(line);
      item.addEventListener("click", () => {
        applySeekTime(line.start, true);
      });
      state.lyricItems.push(item);
      fragment.appendChild(item);
    });

    state.lyricsList.appendChild(fragment);
    syncLyrics(true);
  };

  const loadLyrics = () => {
    if (state.lyricsAbortController) {
      state.lyricsAbortController.abort();
      state.lyricsAbortController = null;
    }

    const track = state.playlist && state.playlist[state.currentIndex];
    if (!track || !track.lyrics) {
      state.lyricsMessage = track ? "这一首暂无歌词文件。" : "还没有可播放的曲目。";
      state.lyricsLines = [];
      renderLyrics();
      return;
    }

    const requestedIndex = state.currentIndex;
    const controller = typeof window.AbortController === "function" ? new AbortController() : null;
    state.lyricsAbortController = controller;

    fetch(track.lyrics, controller ? { signal: controller.signal } : undefined).then((response) => {
      if (!response.ok) {
        throw new Error("lyrics-not-found");
      }

      return response.text();
    }).then((text) => {
      if (requestedIndex !== state.currentIndex) {
        return;
      }

      state.lyricsLines = parseLrc(text);
      state.lyricsMessage = state.lyricsLines.length
        ? "本地歌词已载入。"
        : "歌词文件已经读到，但还没有有效的时间轴内容。";
      renderLyrics();
    }).catch((error) => {
      if ((controller && controller.signal.aborted) || (error && error.name === "AbortError")) {
        return;
      }
      if (requestedIndex !== state.currentIndex) {
        return;
      }

      state.lyricsLines = [];
      state.lyricsMessage = `没有成功读取歌词文件：${track.lyrics}`;
      renderLyrics();
    });
  };

  const loadTrack = (index, autoplay = false, restoreTime = null) => {
    if (!state.playlist || !state.playlist.length) {
      return;
    }

    const len = state.playlist.length;
    const clamped = ((index % len) + len) % len;
    const prevPlaying = isPlaying();
    state.currentIndex = clamped;
    state.pendingRestoreTime = Number.isFinite(restoreTime) ? Math.max(0, restoreTime) : null;
    const track = state.playlist[clamped];
    state.retryCount = 0;
    state.lastPersistedSecond = -1;

    if (!state.lyricsModeUserSet) {
      state.lyricsMode = track.lyricsMode === "original" || track.lyricsMode === "translation"
        ? track.lyricsMode
        : "dual";
      state.lyricsModeButtons.forEach((button) => {
        button.dataset.active = String(button.dataset.mode === state.lyricsMode);
      });
    }

    if (state.retryTimer) {
      window.clearTimeout(state.retryTimer);
      state.retryTimer = null;
    }

    state.audio.pause();
    state.audio.removeAttribute("src");
    state.audio.load();
    state.audio.src = track.src;
    state.audio.loop = track.loop !== false;
    writeStorage(storageKeys.currentTrack, state.currentIndex);
    if (!Number.isFinite(state.pendingRestoreTime)) {
      writeStorage(storageKeys.currentTime, 0);
    }
    updateMediaSession();

    if (state.title) {
      state.title.textContent = track.title || "未命名音乐";
    }
    if (state.artist) {
      state.artist.textContent = [track.artist, track.subtitle].filter(Boolean).join(" · ") || "";
    }
    if (state.ambience) {
      state.ambience.textContent = track.ambience || "";
    }
    if (state.eyebrow) {
      state.eyebrow.textContent = track.eyebrow || "Stormy Broadcast";
    }
    if (state.cover) {
      if (track.cover) {
        state.cover.src = track.cover;
        state.cover.alt = `${track.title || "歌曲"} 封面`;
        state.cover.hidden = false;
      } else {
        state.cover.removeAttribute("src");
        state.cover.hidden = true;
      }
    }
    if (state.sourceLink) {
      if (track.sourceUrl) {
        state.sourceLink.href = track.sourceUrl;
        state.sourceLink.textContent = track.sourceLabel || "音源";
        state.sourceLink.hidden = false;
      } else {
        state.sourceLink.hidden = true;
      }
    }
    if (state.lyricsToggleButton) {
      state.lyricsToggleButton.hidden = !track.lyrics;
    }
    if (state.badge) {
      state.badge.textContent = track.lyrics ? "Single Track" : "纯音乐";
    }

    state.lyricsLines = [];
    state.activeLyricIndex = -1;
    state.lyricsMessage = track.lyrics ? "歌词正在从本地文件载入。" : "这一首暂无歌词文件。";

    updatePlaylistActive();
    renderLyrics();
    updateProgressUI();

    if (autoplay || prevPlaying) {
      playMusic({ reason: "track-change" });
    }

    loadLyrics();
  };

  const prevTrack = () => {
    loadTrack(state.currentIndex - 1, true);
  };

  const nextTrack = () => {
    loadTrack(state.currentIndex + 1, true);
  };

  const setLyricsMode = (mode) => {
    if (mode !== "dual" && mode !== "original" && mode !== "translation") {
      return;
    }
    state.lyricsMode = mode;
    state.lyricsModeUserSet = true;
    writeStorage(storageKeys.lyricsMode, mode);
    state.lyricsModeButtons.forEach((btn) => {
      btn.dataset.active = String(btn.dataset.mode === mode);
    });
    renderLyrics();
  };

  const updatePlaylistActive = () => {
    if (!state.playlistList) {
      return;
    }
    const items = state.playlistList.querySelectorAll(".music-player__playlist-item");
    items.forEach((item, index) => {
      const active = index === state.currentIndex;
      item.dataset.current = String(active);
      item.setAttribute("aria-current", active ? "true" : "false");
    });
  };

  const renderPlaylist = () => {
    if (!state.playlistList || !state.playlist) {
      return;
    }

    state.playlistList.innerHTML = "";
    const fragment = document.createDocumentFragment();

    state.playlist.forEach((track, index) => {
      const item = document.createElement("button");
      item.className = "music-player__playlist-item";
      item.type = "button";
      item.dataset.current = String(index === state.currentIndex);
      item.setAttribute("aria-current", index === state.currentIndex ? "true" : "false");
      const titleSpan = document.createElement("span");
      titleSpan.className = "music-player__playlist-name";
      titleSpan.textContent = track.title || track.file;
      const metaSpan = document.createElement("span");
      metaSpan.className = "music-player__playlist-meta";
      metaSpan.textContent = [track.artist, track.subtitle].filter(Boolean).join(" · ") || "未知艺术家";
      item.appendChild(titleSpan);
      item.appendChild(metaSpan);
      item.addEventListener("click", () => {
        if (index !== state.currentIndex) {
          loadTrack(index, true);
        }
      });
      fragment.appendChild(item);
    });

    state.playlistList.appendChild(fragment);
  };

  const togglePlaylistPane = () => {
    state.playlistOpen = !state.playlistOpen;
    writeStorage(storageKeys.playlistOpen, state.playlistOpen);
    render();
  };

  const handleKeyboardShortcut = (event) => {
    if (state.hidden || state.collapsed || !state.root) {
      return;
    }
    const target = event.target;
    if (!target || !state.root.contains(target)) {
      return;
    }
    if (
      target.tagName === "INPUT"
      || target.tagName === "TEXTAREA"
      || target.tagName === "BUTTON"
      || target.tagName === "A"
      || target.isContentEditable
    ) {
      return;
    }
    if (target === state.progressTrack) {
      return;
    }
    switch (event.key) {
      case " ":
      case "Spacebar":
        event.preventDefault();
        togglePlayback();
        break;
      case "ArrowLeft":
        event.preventDefault();
        applySeekTime(state.audio.currentTime - 5, true);
        break;
      case "ArrowRight":
        event.preventDefault();
        applySeekTime(state.audio.currentTime + 5, true);
        break;
      case "ArrowUp":
        event.preventDefault();
        setVolume(clamp(state.desiredVolume + 0.05, 0, 1), true);
        break;
      case "ArrowDown":
        event.preventDefault();
        setVolume(clamp(state.desiredVolume - 0.05, 0, 1), true);
        break;
      case "m":
      case "M":
        if (state.muteButton) {
          state.muteButton.click();
        }
        break;
      case "n":
      case "N":
        nextTrack();
        break;
      case "p":
      case "P":
        prevTrack();
        break;
      default:
        break;
    }
  };

  const render = () => {
    if (!state.root) {
      return;
    }

    state.root.dataset.collapsed = String(state.collapsed);
    state.root.dataset.hidden = String(state.hidden);
    state.root.dataset.playing = String(isPlaying());
    state.root.dataset.dragging = String(state.drag.active);
    state.root.dataset.warm = String(state.autoWarmMuted && isPlaying());
    state.root.dataset.lyricsOpen = String(state.lyricsOpen);
    state.root.dataset.playlistOpen = String(state.playlistOpen);
    state.root.dataset.compact = String(state.compactMode);
    updatePlayButton();
    updateMuteButton();
    updateProgressUI();
    updateVolumeUI();
    updateLauncher();
    updateHint();
    updateLyricsToggle();
    syncLyrics();
    window.requestAnimationFrame(() => {
      syncPositionWithinViewport();

      if (state.revealLyricsOnNextRender) {
        revealLyricsPane(true);
        state.revealLyricsOnNextRender = false;
      }
    });
  };

  const clearInteractionUnlock = () => {
    if (!state.unlockListenersBound) {
      return;
    }

    state.unlockListenersBound = false;
    document.removeEventListener("pointerdown", handleInteractionUnlock, true);
    document.removeEventListener("touchstart", handleInteractionUnlock, true);
    document.removeEventListener("keydown", handleInteractionUnlock, true);
  };

  const registerInteractionUnlock = () => {
    if (config.autoUnlockOnFirstInteraction === false || state.unlockListenersBound || state.userDismissed) {
      return;
    }

    state.unlockListenersBound = true;
    document.addEventListener("pointerdown", handleInteractionUnlock, true);
    document.addEventListener("touchstart", handleInteractionUnlock, true);
    document.addEventListener("keydown", handleInteractionUnlock, true);
  };

  const promoteWarmPlayback = (statusMessage = "已根据首次交互自动恢复声音。") => {
    state.autoWarmMuted = false;
    state.audio.muted = state.muted;
    state.audio.volume = 0;
    fadeTo(state.desiredVolume);
    setStatus(statusMessage, "ok");
    clearInteractionUnlock();
    render();
  };

  const setVolume = (value, withFade = false) => {
    state.desiredVolume = clamp(value, 0, 1);
    writeStorage(storageKeys.volume, state.desiredVolume);

    if (state.desiredVolume > 0 && state.audio.muted && !state.autoWarmMuted) {
      state.audio.muted = false;
      state.muted = false;
      writeStorage(storageKeys.muted, false);
    }

    if (withFade && isPlaying()) {
      fadeTo(state.desiredVolume);
    } else {
      stopFade();
      state.audio.volume = state.audio.muted ? 0 : state.desiredVolume;
    }

    render();
  };

  const playMusic = ({
    withFade = false,
    reason = "manual",
    successStatus,
    failureStatus
  } = {}) => {
    stopFade();
    state.userDismissed = false;
    state.shouldBePlaying = true;

    if (!state.autoWarmMuted) {
      state.audio.muted = state.muted;
    }

    state.audio.volume = state.audio.muted || state.autoWarmMuted
      ? 0
      : (withFade ? 0 : state.desiredVolume);

    return state.audio.play().then(() => {
      if (!state.audio.muted && !state.autoWarmMuted) {
        if (withFade) {
          fadeTo(state.desiredVolume);
        } else {
          state.audio.volume = state.desiredVolume;
        }
      }

      state.hidden = false;
      state.collapsed = false;
      persistViewState();
      persistPlaybackState(true);
      if (playbackChannel) {
        playbackChannel.postMessage({ type: "playing" });
      }
      setStatus(successStatus || (reason === "autoplay" ? "背景音乐已自动尝试开启。" : "背景音乐播放中。"), "ok");
      render();
      return true;
    }).catch(() => {
      setStatus(
        failureStatus || (reason === "autoplay"
          ? "浏览器拦截了直接播音，我会在你第一次触碰页面时再自动试一次。"
          : "浏览器阻止了播放，请再点一次播放按钮。"),
        "warn"
      );
      render();
      return false;
    });
  };

  const tryMutedWarmup = () => {
    if (config.mutedWarmupOnAutoplayBlock === false || state.userDismissed) {
      return Promise.resolve(false);
    }

    stopFade();
    state.autoWarmMuted = true;
    state.audio.muted = true;
    state.audio.volume = 0;

    return state.audio.play().then(() => {
      state.hidden = false;
      state.collapsed = false;
      persistViewState();
      setStatus("已静音预热，等你第一次点按页面时我会自动恢复声音。", "warn");
      registerInteractionUnlock();
      render();
      return true;
    }).catch(() => {
      state.autoWarmMuted = false;
      state.audio.muted = state.muted;
      state.audio.volume = state.muted ? 0 : state.desiredVolume;
      render();
      return false;
    });
  };

  const pauseMusic = (message = "音乐已暂停。") => {
    clearInteractionUnlock();
    state.autoWarmMuted = false;
    state.shouldBePlaying = false;
    state.audio.pause();
    persistPlaybackState(true);
    setStatus(message);
    render();
  };

  const togglePlayback = () => {
    if (isPlaying()) {
      if (state.autoWarmMuted && state.audio.muted) {
        promoteWarmPlayback("已恢复声音。");
        return;
      }

      pauseMusic();
      return;
    }

    playMusic({ reason: "manual" });
  };

  const openPanel = () => {
    state.collapsed = false;
    state.hidden = false;
    persistViewState();
    render();
  };

  const collapsePanel = () => {
    state.collapsed = true;
    state.hidden = false;
    persistViewState();
    render();
  };

  const toggleLyricsPane = () => {
    state.lyricsOpen = !state.lyricsOpen;
    state.revealLyricsOnNextRender = state.lyricsOpen;
    persistLyricsState();
    render();
  };

  const closeMusic = () => {
    state.userDismissed = true;
    clearInteractionUnlock();
    state.autoWarmMuted = false;
    state.shouldBePlaying = false;
    state.audio.pause();
    state.audio.currentTime = 0;
    persistPlaybackState(true);
    state.collapsed = true;
    state.hidden = true;
    persistViewState();
    setStatus("音乐已关闭，角落里的唱片会继续待命。");
    render();
  };

  const shouldSuppressClick = (event) => {
    if (!state.drag.suppressClick) {
      return false;
    }

    state.drag.suppressClick = false;
    event.preventDefault();
    event.stopPropagation();
    return true;
  };

  const startDrag = (event) => {
    if (!state.root) {
      return;
    }

    if (event.pointerType === "mouse" && event.button !== 0) {
      return;
    }

    const rect = state.root.getBoundingClientRect();
    state.drag.active = true;
    state.drag.pointerId = event.pointerId;
    state.drag.startPointerX = event.clientX;
    state.drag.startPointerY = event.clientY;
    state.drag.startX = rect.left;
    state.drag.startY = rect.top;
    state.drag.moved = false;

    if (event.currentTarget && typeof event.currentTarget.setPointerCapture === "function") {
      event.currentTarget.setPointerCapture(event.pointerId);
    }

    render();
  };

  const onDragMove = (event) => {
    if (!state.drag.active || event.pointerId !== state.drag.pointerId) {
      return;
    }

    const deltaX = event.clientX - state.drag.startPointerX;
    const deltaY = event.clientY - state.drag.startPointerY;

    if (!state.drag.moved && (Math.abs(deltaX) > 10 || Math.abs(deltaY) > 10)) {
      state.drag.moved = true;
    }

    applyPosition(state.drag.startX + deltaX, state.drag.startY + deltaY);
  };

  const stopDrag = (event) => {
    if (!state.drag.active || event.pointerId !== state.drag.pointerId) {
      return;
    }

    state.drag.active = false;
    state.drag.pointerId = null;

    if (state.drag.moved) {
      state.drag.suppressClick = true;
      window.setTimeout(() => {
        state.drag.suppressClick = false;
      }, 220);
    }

    render();
  };

  function handleInteractionUnlock(event) {
    if (event.type === "keydown" && event.key === "Tab") {
      return;
    }

    if (state.userDismissed) {
      clearInteractionUnlock();
      return;
    }

    if (isPlaying() && state.autoWarmMuted && state.audio.muted) {
      promoteWarmPlayback();
      return;
    }

    // 不再在用户点页面任意位置时自动播放——避免突兀出声。
    // 用户需主动点播放器的播放键。
    clearInteractionUnlock();
  }

  const createPlayer = () => {
    if (document.getElementById("blog-music-player")) {
      return;
    }

    const root = document.createElement("div");
    root.id = "blog-music-player";
    root.style.setProperty("--music-accent", config.accentColor || "#7edcff");
    root.style.setProperty("--music-secondary", config.secondaryAccent || "#bb9cff");
    root.style.setProperty("--music-warm", config.warmGlowColor || "#ffd68f");
    root.style.setProperty("--music-ui-scale", String(uiScale));
    root.innerHTML = `
      <button class="music-player__launcher" type="button" aria-label="展开音乐播放器">
        <span class="music-player__launcher-core">
          <span class="music-player__launcher-disc">
            <span class="music-player__launcher-note">${icons.note}</span>
            <span class="music-player__launcher-center"></span>
          </span>
        </span>
        <span class="music-player__launcher-tag">
          <span class="music-player__launcher-kicker">MUSIC</span>
          <span class="music-player__launcher-state">STANDBY</span>
        </span>
      </button>
      <section class="music-player__panel" aria-label="站点音乐播放器">
        <div class="music-player__panel-shell">
          <span class="music-player__ambient music-player__ambient--a"></span>
          <span class="music-player__ambient music-player__ambient--b"></span>
          <span class="music-player__ambient music-player__ambient--c"></span>
          <header class="music-player__topbar">
            <button class="music-player__drag" type="button" aria-label="拖动播放器" title="拖动播放器">${icons.drag}</button>
            <div class="music-player__eyebrow-wrap">
              <p class="music-player__eyebrow">${playlistData[0].eyebrow || "Stormy Broadcast"}</p>
              <p class="music-player__hint"></p>
            </div>
            <div class="music-player__actions">
              <button class="music-player__icon-btn music-player__playlist-toggle" type="button" aria-label="展开歌单">${icons.list}</button>
              <button class="music-player__icon-btn music-player__lyrics-toggle" type="button" aria-label="展开歌词面板">${icons.lyrics}</button>
              <button class="music-player__icon-btn music-player__collapse" type="button" aria-label="收起播放器">${icons.collapse}</button>
              <button class="music-player__icon-btn music-player__close" type="button" aria-label="关闭音乐">${icons.close}</button>
            </div>
          </header>
          <div class="music-player__layout">
            <aside class="music-player__playlist-pane">
              <div class="music-player__playlist-head">
                <p class="music-player__playlist-kicker">Playlist</p>
                <h4 class="music-player__playlist-title">歌单</h4>
              </div>
              <div class="music-player__playlist-list" tabindex="0"></div>
            </aside>
            <div class="music-player__main">
              <div class="music-player__hero">
                <div class="music-player__cover-stage">
                  <span class="music-player__cover-glow"></span>
                  <span class="music-player__vinyl">
                    <span class="music-player__vinyl-core"></span>
                  </span>
                  <div class="music-player__cover-card">
                    <img class="music-player__cover" alt="歌曲封面" decoding="async" />
                  </div>
                </div>
                <div class="music-player__meta">
                  <span class="music-player__badge">Single Track</span>
                  <h3 class="music-player__title"></h3>
                  <p class="music-player__artist"></p>
                  <p class="music-player__ambience"></p>
                  <div class="music-player__lyric-spotlight">
                    <p class="music-player__lyric-current"></p>
                    <p class="music-player__lyric-next"></p>
                  </div>
                </div>
              </div>
              <div class="music-player__progress-card">
                <div class="music-player__times">
                  <span class="music-player__current">0:00</span>
                  <span class="music-player__duration">0:00</span>
                </div>
                <div
                  class="music-player__progress"
                  role="slider"
                  tabindex="0"
                  aria-label="播放进度"
                  aria-valuemin="0"
                  aria-valuemax="100"
                  aria-valuenow="0"
                  aria-valuetext="0:00 / 0:00"
                >
                  <span class="music-player__progress-rail" aria-hidden="true"></span>
                  <span class="music-player__progress-fill" aria-hidden="true"></span>
                  <span class="music-player__progress-thumb" aria-hidden="true"></span>
                </div>
              </div>
              <div class="music-player__control-row">
                <div class="music-player__pulse music-player__pulse--left" aria-hidden="true">
                  <span></span><span></span><span></span><span></span><span></span>
                </div>
                <button class="music-player__icon-btn music-player__prev" type="button" aria-label="上一首">${icons.prev}</button>
                <button class="music-player__play" type="button" aria-label="播放音乐">${icons.play}</button>
                <button class="music-player__icon-btn music-player__next" type="button" aria-label="下一首">${icons.next}</button>
                <div class="music-player__pulse music-player__pulse--right" aria-hidden="true">
                  <span></span><span></span><span></span><span></span><span></span>
                </div>
              </div>
              <div class="music-player__volume-row">
                <button class="music-player__icon-btn music-player__mute" type="button" aria-label="静音">${icons.volume}</button>
                <div class="music-player__volume-stack">
                  <span class="music-player__volume-label">Volume</span>
                  <input class="music-player__volume" type="range" min="0" max="100" value="18" step="1" aria-label="音量" />
                </div>
              </div>
              <div class="music-player__footer">
                <span class="music-player__status" data-tone="normal"></span>
                <a class="music-player__source" href="#" target="_blank" rel="noopener noreferrer"></a>
              </div>
            </div>
            <aside class="music-player__lyrics-pane">
              <div class="music-player__lyrics-head">
                <div>
                  <p class="music-player__lyrics-kicker">Local Lyrics</p>
                  <h4 class="music-player__lyrics-title">时序歌词</h4>
                </div>
                <div class="music-player__lyrics-modes" role="group" aria-label="歌词模式">
                  <button class="music-player__lyrics-mode" type="button" data-mode="original" aria-label="仅原文">原</button>
                  <button class="music-player__lyrics-mode" type="button" data-mode="translation" aria-label="仅译文">译</button>
                  <button class="music-player__lyrics-mode" type="button" data-mode="dual" aria-label="双语对照">双</button>
                </div>
              </div>
              <div class="music-player__lyrics-list" tabindex="0"></div>
            </aside>
          </div>
        </div>
      </section>
    `;

    document.body.appendChild(root);

    state.root = root;
    state.panel = root.querySelector(".music-player__panel");
    state.panelShell = root.querySelector(".music-player__panel-shell");
    state.launcher = root.querySelector(".music-player__launcher");
    state.launcherState = root.querySelector(".music-player__launcher-state");
    state.playButton = root.querySelector(".music-player__play");
    state.muteButton = root.querySelector(".music-player__mute");
    state.collapseButton = root.querySelector(".music-player__collapse");
    state.closeButton = root.querySelector(".music-player__close");
    state.lyricsToggleButton = root.querySelector(".music-player__lyrics-toggle");
    state.dragHandle = root.querySelector(".music-player__drag");
    state.progressTrack = root.querySelector(".music-player__progress");
    state.volumeInput = root.querySelector(".music-player__volume");
    state.currentTime = root.querySelector(".music-player__current");
    state.durationTime = root.querySelector(".music-player__duration");
    state.title = root.querySelector(".music-player__title");
    state.artist = root.querySelector(".music-player__artist");
    state.ambience = root.querySelector(".music-player__ambience");
    state.hint = root.querySelector(".music-player__hint");
    state.sourceLink = root.querySelector(".music-player__source");
    state.status = root.querySelector(".music-player__status");
    state.cover = root.querySelector(".music-player__cover");
    state.lyricsPane = root.querySelector(".music-player__lyrics-pane");
    state.lyricsList = root.querySelector(".music-player__lyrics-list");
    state.lyricCurrent = root.querySelector(".music-player__lyric-current");
    state.lyricNext = root.querySelector(".music-player__lyric-next");
    state.eyebrow = root.querySelector(".music-player__eyebrow");
    state.badge = root.querySelector(".music-player__badge");
    state.playlistList = root.querySelector(".music-player__playlist-list");
    state.playlistToggleButton = root.querySelector(".music-player__playlist-toggle");
    state.prevButton = root.querySelector(".music-player__prev");
    state.nextButton = root.querySelector(".music-player__next");
    state.lyricsModeButtons = Array.from(root.querySelectorAll(".music-player__lyrics-mode"));

    if (state.collapseButton) {
      state.collapseButton.setAttribute("title", "Minimize player");
    }

    if (state.closeButton) {
      state.closeButton.setAttribute("title", "Close player");
    }

    state.lyricsModeButtons.forEach((btn) => {
      btn.dataset.active = String(btn.dataset.mode === state.lyricsMode);
      btn.addEventListener("click", () => setLyricsMode(btn.dataset.mode));
    });

    renderPlaylist();

    state.launcher.addEventListener("click", (event) => {
      if (shouldSuppressClick(event)) {
        return;
      }

      if (state.hidden || state.collapsed) {
        openPanel();
      } else {
        collapsePanel();
      }
    });

    state.playButton.addEventListener("click", togglePlayback);
    state.collapseButton.addEventListener("click", collapsePanel);
    state.closeButton.addEventListener("click", closeMusic);
    state.lyricsToggleButton.addEventListener("click", toggleLyricsPane);
    state.playlistToggleButton.addEventListener("click", togglePlaylistPane);
    state.prevButton.addEventListener("click", prevTrack);
    state.nextButton.addEventListener("click", nextTrack);
    state.dragHandle.addEventListener("click", (event) => {
      shouldSuppressClick(event);
      event.preventDefault();
    });

    [state.launcher, state.dragHandle].forEach((handle) => {
      handle.addEventListener("pointerdown", startDrag);
    });

    window.addEventListener("pointermove", onDragMove);
    window.addEventListener("pointerup", stopDrag);
    window.addEventListener("pointercancel", stopDrag);

    state.muteButton.addEventListener("click", () => {
      if (state.autoWarmMuted && state.audio.muted) {
        promoteWarmPlayback("已恢复声音。");
        return;
      }

      state.audio.muted = !state.audio.muted;
      state.muted = state.audio.muted;
      state.autoWarmMuted = false;
      writeStorage(storageKeys.muted, state.muted);
      state.audio.volume = state.audio.muted ? 0 : state.desiredVolume;
      setStatus(state.audio.muted ? "音乐已静音。" : "已恢复声音。");
      render();
    });

    state.volumeInput.addEventListener("input", (event) => {
      const nextValue = Number(event.target.value) / 100;
      setVolume(nextValue, false);
      setStatus(nextValue === 0 ? "音量已调到最低。" : "音量已更新。");
    });

    if (window.PointerEvent) {
      state.progressTrack.addEventListener("pointerdown", handleProgressPointerDown);
      window.addEventListener("pointermove", handleProgressPointerMove);
      window.addEventListener("pointerup", handleProgressPointerUp);
      window.addEventListener("pointercancel", handleProgressPointerCancel);
    } else {
      state.progressTrack.addEventListener("click", (event) => {
        applySeekFromPointer(event.clientX);
      });
    }

    state.progressTrack.addEventListener("keydown", handleProgressKeydown);

    state.audio.addEventListener("loadedmetadata", () => {
      if (Number.isFinite(state.pendingRestoreTime) && state.pendingRestoreTime > 0) {
        state.audio.currentTime = clamp(state.pendingRestoreTime, 0, state.audio.duration || state.pendingRestoreTime);
        state.pendingRestoreTime = null;
      }
      updateProgressUI();
      syncLyrics(true);
    });
    state.audio.addEventListener("timeupdate", () => {
      updateProgressUI();
      syncLyrics();
      persistPlaybackState();
    });
    state.audio.addEventListener("seeked", () => {
      updateProgressUI();
      syncLyrics(true);
    });
    state.audio.addEventListener("play", render);
    state.audio.addEventListener("pause", render);
    state.audio.addEventListener("ended", () => {
      persistPlaybackState(true);
      if (!state.audio.loop && state.playlist.length > 1 && state.shouldBePlaying) {
        nextTrack();
        return;
      }
      render();
    });
    state.audio.addEventListener("error", () => {
      if (state.retryCount >= 1) {
        state.shouldBePlaying = false;
        setStatus("音频加载失败，请检查网络后手动重试。", "warn");
        render();
        return;
      }

      setStatus("音频加载失败，2 秒后自动重试一次。", "warn");
      if (state.retryTimer) {
        render();
        return;
      }
      state.retryCount += 1;
      const shouldResume = state.shouldBePlaying;
      state.retryTimer = window.setTimeout(() => {
        state.retryTimer = null;
        const track = state.playlist && state.playlist[state.currentIndex];
        if (track) {
          state.audio.src = track.src;
          state.audio.load();
          if (shouldResume) {
            playMusic({
              reason: "retry",
              successStatus: "音频已重新连接。",
              failureStatus: "音频重试失败，请稍后手动播放。"
            });
          }
        }
      }, 2000);
      render();
    });

    state.panel.addEventListener("transitionend", syncPositionWithinViewport);
    window.addEventListener("resize", syncPositionWithinViewport);
    window.addEventListener("pageshow", syncPositionWithinViewport);
    window.addEventListener("pagehide", () => persistPlaybackState(true));
    document.addEventListener("keydown", handleKeyboardShortcut);

    if ("mediaSession" in navigator) {
      const mediaActions = {
        play: () => playMusic({ reason: "media-session" }),
        pause: () => pauseMusic(),
        previoustrack: prevTrack,
        nexttrack: nextTrack,
        seekbackward: (details) => applySeekTime(state.audio.currentTime - (details.seekOffset || 10), true),
        seekforward: (details) => applySeekTime(state.audio.currentTime + (details.seekOffset || 10), true),
        seekto: (details) => applySeekTime(details.seekTime, true)
      };

      Object.entries(mediaActions).forEach(([action, handler]) => {
        try {
          navigator.mediaSession.setActionHandler(action, handler);
        } catch (_) {
          // 某些浏览器只支持部分 Media Session 动作。
        }
      });
    }

    if (config.autoplayOnFirstVisit === false) {
      setStatus("播放器已就位，点击播放键开始音乐。");
    } else if (state.autoplaySeen) {
      setStatus("播放器已就位，点击角落唱片即可重新展开。");
    } else {
      setStatus("首次访问会尽量自动把音乐送进来。");
    }

    renderLyrics();
    render();
    syncPositionWithinViewport();
  };

  const attemptAutoplay = () => {
    if (config.autoplayOnFirstVisit === false || state.autoplaySeen) {
      return;
    }

    state.autoplaySeen = true;
    state.hidden = false;
    state.collapsed = false;
    persistViewState();
    render();

    playMusic({
      withFade: true,
      reason: "autoplay"
    }).then((ok) => {
      if (ok) {
        writeStorage(storageKeys.autoplaySeen, true);
        return;
      }

      tryMutedWarmup().then((warmOk) => {
        if (!warmOk) {
          registerInteractionUnlock();
        }
      });
    });
  };

  const init = () => {
    createPlayer();
    const restored = restorePlaybackSelection();
    loadTrack(restored.index, false, restored.time);
    attemptAutoplay();
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
