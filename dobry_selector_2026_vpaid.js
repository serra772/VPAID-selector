/*!
 * Dobry Selector — VPAID 2.0 (JavaScript)
 * Background with two halves: left -> 20s video, right -> 10s video.
 * Auto-start of the left (20s) video after 7s of inactivity.
 */
(function (global) {
  'use strict';

  var DEFAULTS = {
    baseUrl: 'https://serra772.github.io/VPAID-selector/',
    background: 'Dobry_selector_1280_720.png',
    videoLeft: 'Dobry_Losville_20s_261023_solta.mp4',
    videoRight: 'Dobry_Losville_10s_261021_solta.mp4',
    durationLeft: 20,
    durationRight: 10,
    autoplayDelay: 7,          // seconds of inactivity before auto-start of the left (20s) video
    autoplaySide: 'left',
    frameWidth: 10,            // white frame thickness in px for a 1280x720 stage (scaled)
    clickThrough: 'https://dobrycola-promo.ru/?utm_medium=video_cpm&utm_source=solta&utm_campaign=dobry_ssd_12-26-12-26_xmas_phd&utm_term=interest_all-12-39&utm_content=selector_20s_equity-ncp&~site-id~&erid=~token-ord~'
  };

  var STAGE_W = 1280;
  var STAGE_H = 720;

  function extend(target) {
    for (var i = 1; i < arguments.length; i++) {
      var src = arguments[i];
      if (!src) continue;
      for (var k in src) {
        if (Object.prototype.hasOwnProperty.call(src, k) && src[k] !== undefined && src[k] !== null && src[k] !== '') {
          target[k] = src[k];
        }
      }
    }
    return target;
  }

  function css(el, styles) {
    for (var k in styles) {
      if (Object.prototype.hasOwnProperty.call(styles, k)) el.style[k] = styles[k];
    }
    return el;
  }

  function now() { return new Date().getTime(); }

  function DobrySelectorVPAID() {
    this._slot = null;
    this._videoSlot = null;
    this._doc = document;
    this._subscribers = {};
    this._attrs = {
      width: 0,
      height: 0,
      viewMode: 'normal',
      expanded: false,
      volume: 1,
      linear: true,
      skippable: false
    };
    this._cfg = extend({}, DEFAULTS);
    this._phase = 'idle'; // idle | loaded | select | video | done
    this._side = null;
    this._video = null;
    this._videos = {};
    this._quartiles = {};
    this._selectElapsed = 0;     // accumulated ms in select phase
    this._selectStartTs = 0;
    this._selectPaused = false;
    this._tickTimer = null;
    this._loadTimer = null;
    this._stopped = false;
    this._els = {};
    this._bound = [];
  }

  /* ---------------- VPAID 2.0 API ---------------- */

  DobrySelectorVPAID.prototype.handshakeVersion = function () {
    return '2.0';
  };

  DobrySelectorVPAID.prototype.initAd = function (width, height, viewMode, desiredBitrate, creativeData, environmentVars) {
    var self = this;
    this._attrs.width = width || 640;
    this._attrs.height = height || 360;
    this._attrs.viewMode = viewMode || 'normal';

    environmentVars = environmentVars || {};
    this._slot = environmentVars.slot || null;
    this._videoSlot = environmentVars.videoSlot || null;

    var params = {};
    try {
      var raw = creativeData && creativeData.AdParameters;
      if (raw) params = typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch (e) {
      this._log('AdParameters parse error: ' + e.message);
    }
    extend(this._cfg, params);
    if (this._cfg.baseUrl && this._cfg.baseUrl.charAt(this._cfg.baseUrl.length - 1) !== '/') {
      this._cfg.baseUrl += '/';
    }

    if (!this._slot) {
      // Fallback: create our own slot (some players don't pass one)
      this._slot = document.createElement('div');
      document.body.appendChild(this._slot);
    }
    this._doc = this._slot.ownerDocument || document;

    // Hide player's own video slot — we render our own video elements
    if (this._videoSlot) {
      try { this._videoSlot.style.visibility = 'hidden'; } catch (e) { /* noop */ }
    }

    this._build();
    this._resize(this._attrs.width, this._attrs.height);

    var done = false;
    var finish = function (ok) {
      if (done) return;
      done = true;
      clearTimeout(self._loadTimer);
      if (!ok) {
        self._emit('AdError', 'Background image failed to load: ' + self._url(self._cfg.background));
        return;
      }
      self._phase = 'loaded';
      self._emit('AdLoaded');
    };
    var img = this._els.bg;
    img.onload = function () { finish(true); };
    img.onerror = function () { finish(false); };
    img.src = this._url(this._cfg.background);
    if (img.complete && img.naturalWidth) finish(true);
    // Don't hang the player if the image is slow
    this._loadTimer = setTimeout(function () { finish(true); }, 5000);
  };

  DobrySelectorVPAID.prototype.startAd = function () {
    if (this._phase !== 'loaded') {
      this._log('startAd called in phase ' + this._phase);
    }
    this._els.root.style.display = 'block';
    this._phase = 'select';
    this._selectElapsed = 0;
    this._selectStartTs = now();
    this._selectPaused = false;
    this._startTick();
    this._emit('AdStarted');
    this._emit('AdImpression');
  };

  DobrySelectorVPAID.prototype.stopAd = function () {
    this._finish('AdStopped');
  };

  DobrySelectorVPAID.prototype.skipAd = function () {
    if (!this._attrs.skippable) return;
    this._finish('AdSkipped', true);
  };

  DobrySelectorVPAID.prototype.resizeAd = function (width, height, viewMode) {
    this._attrs.width = width;
    this._attrs.height = height;
    this._attrs.viewMode = viewMode || this._attrs.viewMode;
    this._resize(width, height);
    this._emit('AdSizeChange');
  };

  DobrySelectorVPAID.prototype.pauseAd = function () {
    if (this._phase === 'select' && !this._selectPaused) {
      this._selectElapsed += now() - this._selectStartTs;
      this._selectPaused = true;
    } else if (this._phase === 'video' && this._video) {
      this._video.pause();
    }
    this._emit('AdPaused');
  };

  DobrySelectorVPAID.prototype.resumeAd = function () {
    if (this._phase === 'select' && this._selectPaused) {
      this._selectStartTs = now();
      this._selectPaused = false;
    } else if (this._phase === 'video' && this._video) {
      this._play(this._video);
    }
    this._emit('AdPlaying');
  };

  DobrySelectorVPAID.prototype.expandAd = function () {
    this._attrs.expanded = true;
    this._emit('AdExpandedChange');
  };

  DobrySelectorVPAID.prototype.collapseAd = function () {
    this._attrs.expanded = false;
    this._emit('AdExpandedChange');
  };

  DobrySelectorVPAID.prototype.subscribe = function (fn, event, ctx) {
    if (typeof fn !== 'function') return;
    (this._subscribers[event] = this._subscribers[event] || []).push({ fn: fn, ctx: ctx });
  };

  DobrySelectorVPAID.prototype.unsubscribe = function (fn, event) {
    var list = this._subscribers[event];
    if (!list) return;
    for (var i = list.length - 1; i >= 0; i--) {
      if (list[i].fn === fn) list.splice(i, 1);
    }
  };

  DobrySelectorVPAID.prototype.getAdLinear = function () { return this._attrs.linear; };
  DobrySelectorVPAID.prototype.getAdWidth = function () { return this._attrs.width; };
  DobrySelectorVPAID.prototype.getAdHeight = function () { return this._attrs.height; };
  DobrySelectorVPAID.prototype.getAdExpanded = function () { return this._attrs.expanded; };
  DobrySelectorVPAID.prototype.getAdSkippableState = function () { return this._attrs.skippable; };
  DobrySelectorVPAID.prototype.getAdCompanions = function () { return ''; };
  DobrySelectorVPAID.prototype.getAdIcons = function () { return false; };
  DobrySelectorVPAID.prototype.getAdVolume = function () { return this._attrs.volume; };

  DobrySelectorVPAID.prototype.setAdVolume = function (value) {
    value = Math.max(0, Math.min(1, Number(value) || 0));
    if (value === this._attrs.volume) return;
    this._attrs.volume = value;
    this._applyVolume();
    this._emit('AdVolumeChange');
  };

  DobrySelectorVPAID.prototype.getAdDuration = function () {
    var cfg = this._cfg;
    if (this._phase === 'video' || this._phase === 'done') {
      var d = (this._video && isFinite(this._video.duration) && this._video.duration) ||
        (this._side === 'right' ? cfg.durationRight : cfg.durationLeft);
      return Math.round((this._selectElapsed / 1000 + d) * 100) / 100;
    }
    var autoDur = cfg.autoplaySide === 'right' ? cfg.durationRight : cfg.durationLeft;
    return cfg.autoplayDelay + autoDur;
  };

  DobrySelectorVPAID.prototype.getAdRemainingTime = function () {
    var cfg = this._cfg;
    if (this._phase === 'select') {
      var autoDur = cfg.autoplaySide === 'right' ? cfg.durationRight : cfg.durationLeft;
      return Math.max(0, cfg.autoplayDelay - this._getSelectElapsed() / 1000) + autoDur;
    }
    if (this._phase === 'video' && this._video) {
      var dur = isFinite(this._video.duration) && this._video.duration ?
        this._video.duration : (this._side === 'right' ? cfg.durationRight : cfg.durationLeft);
      return Math.max(0, dur - (this._video.currentTime || 0));
    }
    if (this._phase === 'done') return 0;
    return this.getAdDuration();
  };

  /* ---------------- Internals ---------------- */

  DobrySelectorVPAID.prototype._url = function (file) {
    if (/^(https?:)?\/\//i.test(file)) return file;
    return this._cfg.baseUrl + encodeURI(file);
  };

  DobrySelectorVPAID.prototype._emit = function (event) {
    var args = Array.prototype.slice.call(arguments, 1);
    var list = (this._subscribers[event] || []).slice();
    for (var i = 0; i < list.length; i++) {
      try {
        list[i].fn.apply(list[i].ctx, args);
      } catch (e) { /* subscriber errors must not break the ad */ }
    }
  };

  DobrySelectorVPAID.prototype._log = function (msg) {
    this._emit('AdLog', '[DobrySelector] ' + msg);
  };

  DobrySelectorVPAID.prototype._on = function (el, type, fn) {
    el.addEventListener(type, fn, false);
    this._bound.push([el, type, fn]);
  };

  DobrySelectorVPAID.prototype._build = function () {
    var d = this._doc;
    var self = this;
    var els = this._els;

    var root = els.root = css(d.createElement('div'), {
      position: 'absolute', left: '0', top: '0', width: '100%', height: '100%',
      overflow: 'hidden', background: '#000', display: 'none', zIndex: '1',
      fontSize: '0', lineHeight: '0', userSelect: 'none', webkitUserSelect: 'none',
      webkitTapHighlightColor: 'rgba(0,0,0,0)'
    });

    // ---- videos (one element per side, so the chosen one starts instantly) ----
    var makeVideo = function (side, file, preload) {
      var v = d.createElement('video');
      v.setAttribute('playsinline', '');
      v.setAttribute('webkit-playsinline', '');
      v.setAttribute('preload', preload);
      v.setAttribute('disablePictureInPicture', '');
      v.setAttribute('x-webkit-airplay', 'deny');
      v.playsInline = true;
      v.controls = false;
      css(v, {
        position: 'absolute', left: '0', top: '0', width: '100%', height: '100%',
        objectFit: 'contain', background: '#000', display: 'none', zIndex: '1'
      });
      v.src = self._url(file);
      root.appendChild(v);
      self._videos[side] = v;
      return v;
    };
    var autoLeft = this._cfg.autoplaySide !== 'right';
    makeVideo('left', this._cfg.videoLeft, autoLeft ? 'auto' : 'metadata');
    makeVideo('right', this._cfg.videoRight, autoLeft ? 'metadata' : 'auto');

    // ---- click catcher over the video (click-through) ----
    var clickLayer = els.clickLayer = css(d.createElement('div'), {
      position: 'absolute', left: '0', top: '0', width: '100%', height: '100%',
      zIndex: '2', cursor: 'pointer', display: 'none', background: 'rgba(0,0,0,0)'
    });
    this._on(clickLayer, 'click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      self._clickThrough();
    });
    root.appendChild(clickLayer);

    // ---- selector stage (16:9 box, letterboxed inside the slot) ----
    var selector = els.selector = css(d.createElement('div'), {
      position: 'absolute', left: '0', top: '0', width: '100%', height: '100%',
      zIndex: '3', background: '#000', opacity: '1', transition: 'opacity .35s ease'
    });
    var stage = els.stage = css(d.createElement('div'), {
      position: 'absolute', overflow: 'hidden'
    });
    var bg = els.bg = d.createElement('img');
    bg.alt = '';
    bg.draggable = false;
    css(bg, {
      position: 'absolute', left: '0', top: '0', width: '100%', height: '100%',
      display: 'block', pointerEvents: 'none'
    });
    stage.appendChild(bg);

    var makeHalf = function (side) {
      var half = css(d.createElement('div'), {
        position: 'absolute', top: '0', width: '50%', height: '100%',
        left: side === 'left' ? '0' : '50%', cursor: 'pointer'
      });
      var frame = css(d.createElement('div'), {
        position: 'absolute', left: '0', top: '0', right: '0', bottom: '0',
        boxSizing: 'border-box', border: '10px solid #fff',
        opacity: '0', transition: 'opacity .2s ease', pointerEvents: 'none'
      });
      half.appendChild(frame);
      half._frame = frame;

      self._on(half, 'mouseenter', function () { if (self._phase === 'select') self._highlight(side); });
      self._on(half, 'mouseleave', function () { if (self._phase === 'select') self._highlight(null); });
      self._on(half, 'touchstart', function () { if (self._phase === 'select') self._highlight(side); });
      self._on(half, 'click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        if (self._phase !== 'select') return;
        self._emit('AdInteraction', 'select_' + side);
        self._choose(side);
      });
      stage.appendChild(half);
      return half;
    };
    els.left = makeHalf('left');
    els.right = makeHalf('right');

    selector.appendChild(stage);
    root.appendChild(selector);
    this._slot.appendChild(root);
  };

  DobrySelectorVPAID.prototype._resize = function (w, h) {
    var els = this._els;
    if (!els.stage) return;
    w = w || this._slot.offsetWidth || STAGE_W;
    h = h || this._slot.offsetHeight || STAGE_H;
    var scale = Math.min(w / STAGE_W, h / STAGE_H);
    var sw = Math.round(STAGE_W * scale);
    var sh = Math.round(STAGE_H * scale);
    css(els.stage, {
      width: sw + 'px', height: sh + 'px',
      left: Math.round((w - sw) / 2) + 'px', top: Math.round((h - sh) / 2) + 'px'
    });
    var b = Math.max(2, Math.round(this._cfg.frameWidth * scale)) + 'px';
    els.left._frame.style.borderWidth = b;
    els.right._frame.style.borderWidth = b;
  };

  DobrySelectorVPAID.prototype._highlight = function (side) {
    this._els.left._frame.style.opacity = side === 'left' ? '1' : '0';
    this._els.right._frame.style.opacity = side === 'right' ? '1' : '0';
  };

  DobrySelectorVPAID.prototype._getSelectElapsed = function () {
    return this._selectElapsed + (this._selectPaused ? 0 : now() - this._selectStartTs);
  };

  DobrySelectorVPAID.prototype._startTick = function () {
    var self = this;
    var lastSec = -1;
    this._stopTick();
    this._tickTimer = setInterval(function () {
      if (self._phase === 'select') {
        var elapsed = self._getSelectElapsed();
        if (elapsed >= self._cfg.autoplayDelay * 1000) {
          self._choose(self._cfg.autoplaySide === 'right' ? 'right' : 'left', true);
          return;
        }
        var sec = Math.floor(elapsed / 1000);
        if (sec !== lastSec) {
          lastSec = sec;
          self._emit('AdRemainingTimeChange');
        }
      }
    }, 100);
  };

  DobrySelectorVPAID.prototype._stopTick = function () {
    if (this._tickTimer) clearInterval(this._tickTimer);
    this._tickTimer = null;
  };

  DobrySelectorVPAID.prototype._choose = function (side, auto) {
    if (this._phase !== 'select') return;
    var self = this;
    if (!this._selectPaused) {
      this._selectElapsed += now() - this._selectStartTs;
      this._selectPaused = true;
    }
    this._stopTick();
    this._phase = 'video';
    this._side = side;
    this._log((auto ? 'auto-' : '') + 'selected ' + side);
    this._highlight(side);

    // Release the other video
    var other = this._videos[side === 'left' ? 'right' : 'left'];
    if (other) {
      try { other.pause(); other.removeAttribute('src'); other.load(); } catch (e) { /* noop */ }
      if (other.parentNode) other.parentNode.removeChild(other);
    }

    var v = this._video = this._videos[side];
    v.style.display = 'block';
    this._applyVolume();
    this._quartiles = {};

    var onTime = function () { self._onTimeUpdate(); };
    var onEnded = function () { self._onVideoEnded(); };
    var onError = function () {
      if (self._phase !== 'video') return;
      self._emit('AdError', 'Video error: ' + self._url(side === 'left' ? self._cfg.videoLeft : self._cfg.videoRight));
      self._finish(null);
    };
    var onMeta = function () { self._emit('AdDurationChange'); };
    this._on(v, 'timeupdate', onTime);
    this._on(v, 'ended', onEnded);
    this._on(v, 'error', onError);
    this._on(v, 'loadedmetadata', onMeta);

    // play() synchronously inside the user gesture (important for mobile)
    this._play(v);

    this._els.clickLayer.style.display = 'block';
    this._emit('AdDurationChange');
    this._emit('AdRemainingTimeChange');

    // Keep the white frame visible for a moment, then fade the selector out
    setTimeout(function () {
      if (!self._els.selector) return;
      self._els.selector.style.opacity = '0';
      self._els.selector.style.pointerEvents = 'none';
      setTimeout(function () {
        if (self._els.selector) self._els.selector.style.display = 'none';
      }, 400);
    }, auto ? 450 : 250);
  };

  DobrySelectorVPAID.prototype._applyVolume = function () {
    var vol = this._attrs.volume;
    for (var k in this._videos) {
      if (!Object.prototype.hasOwnProperty.call(this._videos, k)) continue;
      var v = this._videos[k];
      try {
        v.volume = vol;
        v.muted = vol === 0;
      } catch (e) { /* noop */ }
    }
  };

  DobrySelectorVPAID.prototype._play = function (v) {
    var self = this;
    var p;
    try { p = v.play(); } catch (e) { p = null; }
    if (p && typeof p.then === 'function') {
      p.then(null, function (err) {
        if (self._phase !== 'video' || !v.paused) return;
        // Autoplay with sound blocked -> retry muted
        self._log('play() rejected (' + (err && err.name) + '), retrying muted');
        v.muted = true;
        if (self._attrs.volume !== 0) {
          self._attrs.volume = 0;
          self._emit('AdVolumeChange');
        }
        var p2 = v.play();
        if (p2 && typeof p2.then === 'function') {
          p2.then(null, function () {
            self._emit('AdError', 'Unable to start video playback');
            self._finish(null);
          });
        }
      });
    }
  };

  DobrySelectorVPAID.prototype._onTimeUpdate = function () {
    var v = this._video;
    if (!v || this._phase !== 'video') return;
    var dur = v.duration;
    var t = v.currentTime;
    if (!isFinite(dur) || dur <= 0) return;
    var q = this._quartiles;
    if (!q.start && t > 0) { q.start = true; this._emit('AdVideoStart'); }
    if (!q.first && t >= dur * 0.25) { q.first = true; this._emit('AdVideoFirstQuartile'); }
    if (!q.mid && t >= dur * 0.5) { q.mid = true; this._emit('AdVideoMidpoint'); }
    if (!q.third && t >= dur * 0.75) { q.third = true; this._emit('AdVideoThirdQuartile'); }
    var sec = Math.floor(t);
    if (sec !== q.lastSec) { q.lastSec = sec; this._emit('AdRemainingTimeChange'); }
  };

  DobrySelectorVPAID.prototype._onVideoEnded = function () {
    if (this._phase !== 'video') return;
    var q = this._quartiles;
    if (!q.start) this._emit('AdVideoStart');
    if (!q.first) this._emit('AdVideoFirstQuartile');
    if (!q.mid) this._emit('AdVideoMidpoint');
    if (!q.third) this._emit('AdVideoThirdQuartile');
    this._emit('AdVideoComplete');
    this._finish('AdStopped');
  };

  DobrySelectorVPAID.prototype._clickThrough = function () {
    var url = this._cfg.clickThrough;
    var win = null;
    try { win = global.open(url, '_blank'); } catch (e) { win = null; }
    // If our window.open was blocked, ask the player to handle the click-through
    this._emit('AdClickThru', url, '', !win);
  };

  DobrySelectorVPAID.prototype._finish = function (eventName) {
    if (this._stopped) return;
    this._stopped = true;
    this._phase = 'done';
    this._stopTick();
    clearTimeout(this._loadTimer);

    for (var i = 0; i < this._bound.length; i++) {
      var b = this._bound[i];
      try { b[0].removeEventListener(b[1], b[2], false); } catch (e) { /* noop */ }
    }
    this._bound = [];

    for (var k in this._videos) {
      if (!Object.prototype.hasOwnProperty.call(this._videos, k)) continue;
      try { this._videos[k].pause(); this._videos[k].removeAttribute('src'); this._videos[k].load(); } catch (e) { /* noop */ }
    }
    if (this._els.root && this._els.root.parentNode) {
      this._els.root.parentNode.removeChild(this._els.root);
    }
    this._els = {};
    this._videos = {};
    this._video = null;
    if (this._videoSlot) {
      try { this._videoSlot.style.visibility = ''; } catch (e) { /* noop */ }
    }

    var self = this;
    if (eventName) {
      setTimeout(function () { self._emit(eventName); }, 0);
    }
  };

  global.getVPAIDAd = function () {
    return new DobrySelectorVPAID();
  };
})(window);
