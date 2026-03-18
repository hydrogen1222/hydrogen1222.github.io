(function () {
  const config = window.BLOG_MUSIC_CONFIG;

  if (!config || !config.enabled || !config.track || !config.track.src) {
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
    dockY: `${storageNamespace}:dock-y`
  };

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const rememberPosition = config.rememberPosition !== false;
  const defaultVolume = clamp(Number(config.defaultVolume ?? 0.18), 0, 1);

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
    drag:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3Zm6 0a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3ZM9 10.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3Zm6 0a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3ZM9 15a1.5 1.5 0 1 1 0 3A1.5 1.5 0 0 1 9 15Zm6 0a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3Z" fill="currentColor"></path></svg>'
  };

  const state = {
    audio: new Audio(config.track.src),
    root: null,
    panel: null,
    launcher: null,
    playButton: null,
    muteButton: null,
    collapseButton: null,
    closeButton: null,
    dragHandle: null,
    progressInput: null,
    volumeInput: null,
    currentTime: null,
    durationTime: null,
    title: null,
    artist: null,
    hint: null,
    sourceLink: null,
    status: null,
    autoplaySeen: readBoolean(storageKeys.autoplaySeen, false),
    collapsed: readBoolean(storageKeys.collapsed, readBoolean(storageKeys.autoplaySeen, false)),
    hidden: readBoolean(storageKeys.hidden, false),
    muted: readBoolean(storageKeys.muted, false),
    desiredVolume: clamp(Number(readStorage(storageKeys.volume, defaultVolume)), 0, 1),
    fadeTimer: null,
    autoWarmMuted: false,
    unlockListenersBound: false,
    userDismissed: false,
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
    }
  };

  if (state.hidden) {
    state.collapsed = true;
  }

  state.audio.preload = "metadata";
  state.audio.loop = config.track.loop !== false;
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

  const persistPosition = () => {
    if (!rememberPosition || state.position.x === null || state.position.y === null) {
      return;
    }

    writeStorage(storageKeys.dockX, state.position.x);
    writeStorage(storageKeys.dockY, state.position.y);
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

  const isPlaying = () => !state.audio.paused && !state.audio.ended;

  const getViewportPosition = () => {
    if (!state.root) {
      return { x: 24, y: 24 };
    }

    const rect = state.root.getBoundingClientRect();
    const margin = 12;
    const maxX = Math.max(margin, window.innerWidth - rect.width - margin);
    const maxY = Math.max(margin, window.innerHeight - rect.height - margin);

    return {
      margin,
      maxX,
      maxY
    };
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

    state.launcher.dataset.playing = String(isPlaying());
    const label = state.collapsed || state.hidden ? "展开音乐播放器" : "收起音乐播放器";
    state.launcher.setAttribute("aria-label", label);
    state.launcher.setAttribute("title", label);
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

    state.muteButton.innerHTML = state.audio.muted ? icons.mute : icons.volume;
    state.muteButton.setAttribute("aria-label", state.audio.muted ? "取消静音" : "静音");
  };

  const updateProgressUI = () => {
    if (!state.progressInput || !state.currentTime || !state.durationTime) {
      return;
    }

    const duration = Number.isFinite(state.audio.duration) ? state.audio.duration : 0;
    const progress = duration > 0 ? (state.audio.currentTime / duration) * 100 : 0;

    state.progressInput.value = String(progress);
    state.currentTime.textContent = formatTime(state.audio.currentTime);
    state.durationTime.textContent = formatTime(duration);
  };

  const updateVolumeUI = () => {
    if (!state.volumeInput) {
      return;
    }

    const volumeValue = state.audio.muted ? 0 : state.desiredVolume;
    state.volumeInput.value = String(Math.round(volumeValue * 100));
    updateMuteButton();
  };

  const updateHint = () => {
    if (!state.hint) {
      return;
    }

    if (state.autoWarmMuted && isPlaying()) {
      state.hint.textContent = "已静音预热，首次点按页面会自动出声";
      return;
    }

    state.hint.textContent = "拖动唱片或六点手柄都可以重新摆放";
  };

  const render = () => {
    if (!state.root) {
      return;
    }

    state.root.dataset.collapsed = String(state.collapsed);
    state.root.dataset.hidden = String(state.hidden);
    state.root.dataset.playing = String(isPlaying());
    state.root.dataset.dragging = String(state.drag.active);
    state.root.dataset.dismissed = String(state.hidden);
    updatePlayButton();
    updateMuteButton();
    updateProgressUI();
    updateVolumeUI();
    updateLauncher();
    updateHint();
    window.requestAnimationFrame(syncPositionWithinViewport);
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
    state.audio.muted = false;
    state.muted = false;
    writeStorage(storageKeys.muted, false);
    fadeTo(state.desiredVolume);
    setStatus(statusMessage, "ok");
    clearInteractionUnlock();
    render();
  };

  const setVolume = (value, withFade = false) => {
    state.desiredVolume = clamp(value, 0, 1);
    writeStorage(storageKeys.volume, state.desiredVolume);

    if (state.desiredVolume > 0 && state.audio.muted) {
      state.audio.muted = false;
      state.muted = false;
      state.autoWarmMuted = false;
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
    state.autoWarmMuted = false;

    if (state.audio.muted) {
      state.audio.muted = false;
      state.muted = false;
      writeStorage(storageKeys.muted, false);
    }

    state.audio.volume = withFade ? 0 : state.desiredVolume;

    return state.audio.play().then(() => {
      if (withFade) {
        fadeTo(state.desiredVolume);
      } else {
        state.audio.volume = state.desiredVolume;
      }

      state.hidden = false;
      state.collapsed = false;
      persistViewState();
      setStatus(successStatus || (reason === "autoplay" ? "背景音乐已自动开启。" : "背景音乐播放中。"), "ok");
      render();
      return true;
    }).catch(() => {
      setStatus(
        failureStatus || (reason === "autoplay"
          ? "浏览器阻止了直接播音，我会在你第一次触碰页面时再自动试一次。"
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
    state.audio.pause();
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

  const closeMusic = () => {
    state.userDismissed = true;
    clearInteractionUnlock();
    state.autoWarmMuted = false;
    state.audio.pause();
    state.audio.currentTime = 0;
    state.collapsed = true;
    state.hidden = true;
    persistViewState();
    setStatus("音乐已关闭，唱片会留在角落里待命。");
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

    if (!state.drag.moved && (Math.abs(deltaX) > 6 || Math.abs(deltaY) > 6)) {
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

    if (isPlaying()) {
      clearInteractionUnlock();
      return;
    }

    playMusic({
      withFade: true,
      reason: "interaction-unlock",
      successStatus: "已根据首次交互自动开启背景音乐。",
      failureStatus: "当前浏览器仍未放行自动播放，请点播放器里的播放键。"
    }).then((ok) => {
      if (ok) {
        clearInteractionUnlock();
      }
    });
  }

  const createPlayer = () => {
    if (document.getElementById("blog-music-player")) {
      return;
    }

    const root = document.createElement("div");
    root.id = "blog-music-player";
    root.style.setProperty("--music-accent", config.accentColor || "#49b1f5");
    root.innerHTML = `
      <button class="music-player__launcher" type="button" aria-label="展开音乐播放器">
        <span class="music-player__disc-shell">
          <span class="music-player__disc-glow"></span>
          <span class="music-player__disc">
            <span class="music-player__disc-note">${icons.note}</span>
            <span class="music-player__disc-center"></span>
          </span>
          <span class="music-player__disc-shadow"></span>
        </span>
        <span class="music-player__launcher-chip">
          <span class="music-player__launcher-label">BGM</span>
          <span class="music-player__wave" aria-hidden="true">
            <span></span><span></span><span></span>
          </span>
        </span>
      </button>
      <section class="music-player__panel" aria-label="站点音乐播放器">
        <div class="music-player__panel-inner">
          <div class="music-player__header">
            <button class="music-player__drag" type="button" aria-label="拖动播放器" title="拖动播放器">${icons.drag}</button>
            <div class="music-player__eyebrow-wrap">
              <p class="music-player__eyebrow">Soft Arrival</p>
              <p class="music-player__hint"></p>
            </div>
            <div class="music-player__actions">
              <button class="music-player__icon-btn music-player__collapse" type="button" aria-label="收起播放器">${icons.collapse}</button>
              <button class="music-player__icon-btn music-player__close" type="button" aria-label="关闭音乐">${icons.close}</button>
            </div>
          </div>
          <div class="music-player__body">
            <button class="music-player__play" type="button" aria-label="播放音乐">${icons.play}</button>
            <div class="music-player__meta">
              <h3 class="music-player__title"></h3>
              <p class="music-player__artist"></p>
            </div>
          </div>
          <div class="music-player__progress-wrap">
            <input class="music-player__progress" type="range" min="0" max="100" value="0" step="0.1" aria-label="播放进度" />
            <div class="music-player__times">
              <span class="music-player__current">0:00</span>
              <span class="music-player__duration">0:00</span>
            </div>
          </div>
          <div class="music-player__bottom">
            <div class="music-player__volume-row">
              <button class="music-player__icon-btn music-player__mute" type="button" aria-label="静音">${icons.volume}</button>
              <input class="music-player__volume" type="range" min="0" max="100" value="18" step="1" aria-label="音量" />
            </div>
            <div class="music-player__footer">
              <span class="music-player__status" data-tone="normal"></span>
              <a class="music-player__source" href="#" target="_blank" rel="noopener noreferrer"></a>
            </div>
          </div>
        </div>
      </section>
    `;

    document.body.appendChild(root);

    state.root = root;
    state.panel = root.querySelector(".music-player__panel");
    state.launcher = root.querySelector(".music-player__launcher");
    state.playButton = root.querySelector(".music-player__play");
    state.muteButton = root.querySelector(".music-player__mute");
    state.collapseButton = root.querySelector(".music-player__collapse");
    state.closeButton = root.querySelector(".music-player__close");
    state.dragHandle = root.querySelector(".music-player__drag");
    state.progressInput = root.querySelector(".music-player__progress");
    state.volumeInput = root.querySelector(".music-player__volume");
    state.currentTime = root.querySelector(".music-player__current");
    state.durationTime = root.querySelector(".music-player__duration");
    state.title = root.querySelector(".music-player__title");
    state.artist = root.querySelector(".music-player__artist");
    state.hint = root.querySelector(".music-player__hint");
    state.sourceLink = root.querySelector(".music-player__source");
    state.status = root.querySelector(".music-player__status");

    state.title.textContent = config.track.title || "未命名音乐";
    state.artist.textContent = [config.track.artist, config.track.subtitle].filter(Boolean).join(" · ");

    if (config.track.sourceUrl) {
      state.sourceLink.href = config.track.sourceUrl;
      state.sourceLink.textContent = config.track.sourceLabel || "音源";
    } else {
      state.sourceLink.hidden = true;
    }

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

    state.progressInput.addEventListener("input", (event) => {
      if (!Number.isFinite(state.audio.duration) || state.audio.duration <= 0) {
        return;
      }

      const percent = Number(event.target.value) / 100;
      state.audio.currentTime = state.audio.duration * percent;
      updateProgressUI();
    });

    state.audio.addEventListener("loadedmetadata", updateProgressUI);
    state.audio.addEventListener("timeupdate", updateProgressUI);
    state.audio.addEventListener("play", render);
    state.audio.addEventListener("pause", render);
    state.audio.addEventListener("ended", render);
    state.audio.addEventListener("error", () => {
      setStatus("音频加载失败，请检查 blog-music-config.js。", "warn");
      render();
    });

    state.panel.addEventListener("transitionend", syncPositionWithinViewport);
    window.addEventListener("resize", syncPositionWithinViewport);
    window.addEventListener("pageshow", syncPositionWithinViewport);

    if (state.autoplaySeen) {
      setStatus("唱片可以拖动，点击展开后就能继续播放。");
    } else {
      setStatus("首次访问会尽量自动把音乐送进来。");
    }

    render();
    syncPositionWithinViewport();
  };

  const attemptAutoplay = () => {
    if (config.autoplayOnFirstVisit === false || state.autoplaySeen) {
      return;
    }

    state.autoplaySeen = true;
    writeStorage(storageKeys.autoplaySeen, true);
    state.hidden = false;
    state.collapsed = false;
    persistViewState();
    render();

    const startPlayback = () => {
      playMusic({
        withFade: true,
        reason: "autoplay"
      }).then((ok) => {
        if (ok) {
          return;
        }

        tryMutedWarmup().then((warmOk) => {
          if (!warmOk) {
            registerInteractionUnlock();
          }
        });
      });
    };

    if (state.audio.readyState >= 2) {
      startPlayback();
    } else {
      state.audio.addEventListener("canplay", startPlayback, { once: true });
    }
  };

  const init = () => {
    createPlayer();
    attemptAutoplay();
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
