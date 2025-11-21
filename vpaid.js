(function (window) {
    "use strict";

    var BRAND_RED = "#bf240f";

    function SelectorVPAID() {
        this._subscribers = {};

        this._attributes = {
            adLinear: true,
            adWidth: 0,
            adHeight: 0,
            adExpanded: false,
            adSkippableState: false,
            adRemainingTime: 0,
            adDuration: 0,
            adVolume: 0.0
        };

        this._slot = null;
        this._videoSlot = null;
        this._viewMode = "normal";
        this._isStarted = false;
        this._isDestroyed = false;

        this._selectorContainer = null;
        this._videoClickLayer = null;
        this._muteButton = null;
        this._autoStartTimer = null;
        this._promoActivated = false;

        this._currentOption = null;
        this._quartiles = { q25: false, q50: false, q75: false, q100: false };
        this._videoEventsBound = false;

        this._config = {
            clickThroughUrl: "https://example.com",
            staticImageUrl: "",
            autoStartTimeoutMs: 10000,
            videoOptions: [],
            customPixelBaseUrl: "",
            customPixelCommonParams: {}
        };
    }

    /* ---------------------------------------------------------
       VPAID API
    ----------------------------------------------------------*/

    SelectorVPAID.prototype.handshakeVersion = function (version) {
        return "2.0";
    };

    SelectorVPAID.prototype.initAd = function (
        width,
        height,
        viewMode,
        desiredBitrate,
        creativeData,
        environmentVars
    ) {
        this._attributes.adWidth = width;
        this._attributes.adHeight = height;
        this._viewMode = viewMode;

        this._slot = environmentVars.slot || null;
        this._videoSlot = environmentVars.videoSlot || null;

        try {
            if (creativeData && creativeData.AdParameters) {
                var p = creativeData.AdParameters;
                if (typeof p === "string") {
                    try {
                        p = JSON.parse(p);
                    } catch (e) {
                        // Если прилетело не JSON — просто игнорируем
                    }
                }
                if (p && typeof p === "object") {
                    this._applyConfig(p);
                }
            }
        } catch (e2) {
            this._emit("AdError", "Bad AdParameters: " + e2.message);
        }

        this._renderStaticFrame();
        this._setupAutoStart();

        this._emit("AdLoaded");
    };

    SelectorVPAID.prototype.startAd = function () {
        if (this._isStarted) {
            return;
        }
        this._isStarted = true;

        this._emit("AdStarted");
        this._emit("AdImpression");
    };

    SelectorVPAID.prototype.stopAd = function () {
        this._destroy();
        this._emit("AdStopped");
    };

    SelectorVPAID.prototype.skipAd = function () {
        this._destroy();
        this._emit("AdSkipped");
    };

    SelectorVPAID.prototype.resizeAd = function (width, height, viewMode) {
        this._attributes.adWidth = width;
        this._attributes.adHeight = height;
        this._viewMode = viewMode;

        if (this._selectorContainer) {
            this._selectorContainer.style.width = width + "px";
            this._selectorContainer.style.height = height + "px";
        }
        if (this._videoClickLayer) {
            this._videoClickLayer.style.width = width + "px";
            this._videoClickLayer.style.height = height + "px";
        }

        this._emit("AdSizeChange");
    };

    SelectorVPAID.prototype.pauseAd = function () {
        if (this._videoSlot && this._videoSlot.pause) {
            this._videoSlot.pause();
        }
        this._emit("AdPaused");
    };

    SelectorVPAID.prototype.resumeAd = function () {
        if (this._videoSlot && this._videoSlot.play) {
            this._videoSlot.play();
        }
        this._emit("AdPlaying");
    };

    SelectorVPAID.prototype.expandAd = function () {
        this._attributes.adExpanded = true;
        this._emit("AdExpandedChange");
    };

    SelectorVPAID.prototype.collapseAd = function () {
        this._attributes.adExpanded = false;
        this._emit("AdExpandedChange");
    };

    SelectorVPAID.prototype.subscribe = function (callback, eventName, context) {
        if (!this._subscribers[eventName]) {
            this._subscribers[eventName] = [];
        }
        this._subscribers[eventName].push({
            callback: callback,
            context: context
        });
    };

    SelectorVPAID.prototype.unsubscribe = function (callback, eventName) {
        var subs = this._subscribers[eventName];
        if (!subs) {
            return;
        }
        for (var i = subs.length - 1; i >= 0; i--) {
            if (subs[i].callback === callback) {
                subs.splice(i, 1);
            }
        }
    };

    /* Getters / setters */

    SelectorVPAID.prototype.getAdLinear = function () {
        return this._attributes.adLinear;
    };

    SelectorVPAID.prototype.getAdWidth = function () {
        return this._attributes.adWidth;
    };

    SelectorVPAID.prototype.getAdHeight = function () {
        return this._attributes.adHeight;
    };

    SelectorVPAID.prototype.getAdExpanded = function () {
        return this._attributes.adExpanded;
    };

    SelectorVPAID.prototype.getAdSkippableState = function () {
        return this._attributes.adSkippableState;
    };

    SelectorVPAID.prototype.getAdRemainingTime = function () {
        return this._attributes.adRemainingTime;
    };

    SelectorVPAID.prototype.getAdDuration = function () {
        return this._attributes.adDuration;
    };

    SelectorVPAID.prototype.getAdVolume = function () {
        return this._attributes.adVolume;
    };

    SelectorVPAID.prototype.setAdVolume = function (volume) {
        if (typeof volume !== "number") {
            return;
        }
        if (volume < 0) {
            volume = 0;
        } else if (volume > 1) {
            volume = 1;
        }
        this._attributes.adVolume = volume;
        if (this._videoSlot) {
            try {
                this._videoSlot.volume = volume;
            } catch (e) { }
        }
        this._emit("AdVolumeChange");
    };

    SelectorVPAID.prototype.getAdCompanions = function () {
        return "";
    };

    SelectorVPAID.prototype.getAdIcons = function () {
        return false;
    };

    /* ---------------------------------------------------------
       APPLY CONFIG
    ----------------------------------------------------------*/

    SelectorVPAID.prototype._applyConfig = function (params) {
        if (!params || typeof params !== "object") {
            return;
        }

        if (typeof params.clickThroughUrl === "string") {
            this._config.clickThroughUrl = params.clickThroughUrl;
        }
        if (typeof params.staticImageUrl === "string") {
            this._config.staticImageUrl = params.staticImageUrl;
        }
        if (typeof params.autoStartTimeoutMs === "number") {
            this._config.autoStartTimeoutMs = params.autoStartTimeoutMs;
        }
        if (params.videoOptions && params.videoOptions.length) {
            var validOptions = [];
            for (var i = 0; i < params.videoOptions.length; i++) {
                var opt = params.videoOptions[i];
                if (opt && opt.id && opt.videoUrl) {
                    validOptions.push(opt);
                }
            }
            this._config.videoOptions = validOptions;
        }
        if (typeof params.customPixelBaseUrl === "string") {
            this._config.customPixelBaseUrl = params.customPixelBaseUrl;
        }
        if (
            params.customPixelCommonParams &&
            typeof params.customPixelCommonParams === "object"
        ) {
            this._config.customPixelCommonParams = params.customPixelCommonParams;
        }
    };

    /* ---------------------------------------------------------
       STATIC FRAME WITH BACKGROUND IMAGE
    ----------------------------------------------------------*/

    /* ---------------------------------------------------------
       STATIC FRAME WITH BACKGROUND IMAGE
    ----------------------------------------------------------*/

    SelectorVPAID.prototype._injectStyles = function () {
        var css = [
            ".vpaid-container { position: relative; overflow: hidden; box-sizing: border-box; background-color: #000; }",
            ".vpaid-background { position: absolute; top: 0; left: 0; width: 100%; height: 100%; background-size: cover; background-position: center center; background-repeat: no-repeat; z-index: 1; pointer-events: none; }",
            ".vpaid-global-border { position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: 10px solid " + BRAND_RED + "; box-sizing: border-box; pointer-events: none; z-index: 2; }",
            ".vpaid-panel { position: absolute; top: 0; width: 50%; height: 100%; cursor: pointer; box-sizing: border-box; transition: all 0.2s ease; z-index: 3; }",
            ".vpaid-panel-left { left: 0; }",
            ".vpaid-panel-right { left: 50%; }",
            ".vpaid-frame { position: absolute; left: 0; top: 0; width: 100%; height: 100%; box-sizing: border-box; border: 10px solid rgba(255,255,255,0); transition: all 0.2s ease; }",
            ".vpaid-dark { position: absolute; left: 0; top: 0; width: 100%; height: 100%; background-color: rgba(0,0,0,0); transition: background-color 0.2s ease; }",
            ".vpaid-divider { position: absolute; top: 0; bottom: 0; left: 50%; width: 10px; margin-left: -5px; background-color: " + BRAND_RED + "; pointer-events: none; z-index: 0; }",
            /* Hover Effects */
            ".vpaid-panel:hover .vpaid-frame { border-color: rgba(255,255,255,0.5); }",
            ".vpaid-panel:hover .vpaid-dark { background-color: rgba(0,0,0,0.4); }",
            /* Mute Button */
            ".vpaid-mute-btn { position: absolute; bottom: 0; right: 0; z-index: 100; display: flex; align-items: center; background-color: rgba(0, 0, 0, 0.5); padding: 8px 12px; border-radius: 4px 0 0 0; cursor: pointer; transition: background-color 0.2s; }",
            ".vpaid-mute-btn:hover { background-color: rgba(0, 0, 0, 0.7); }",
            ".vpaid-mute-icon { width: 24px; height: 24px; margin-right: 8px; fill: #fff; }",
            ".vpaid-mute-text { color: #fff; font-family: sans-serif; font-size: 14px; user-select: none; }"
        ].join(" ");

        var style = document.createElement("style");
        style.type = "text/css";
        if (style.styleSheet) {
            style.styleSheet.cssText = css;
        } else {
            style.appendChild(document.createTextNode(css));
        }

        var target = document.getElementsByTagName("head")[0] || document.body || document.documentElement;
        if (target) {
            target.appendChild(style);
        }
    };

    SelectorVPAID.prototype._renderStaticFrame = function () {
        if (!this._slot) {
            this._emit("AdError", "No slot element");
            return;
        }

        this._injectStyles();

        while (this._slot.firstChild) {
            this._slot.removeChild(this._slot.firstChild);
        }

        var width = this._attributes.adWidth || this._slot.offsetWidth || 1280;
        var height = this._attributes.adHeight || this._slot.offsetHeight || 720;

        var container = document.createElement("div");
        container.className = "vpaid-container";
        container.style.width = width + "px";
        container.style.height = height + "px";

        // 1. Divider (z-index: 0)
        var divider = document.createElement("div");
        divider.className = "vpaid-divider";
        container.appendChild(divider);

        // 2. Background Layer (z-index: 1)
        if (this._config.staticImageUrl) {
            var bgLayer = document.createElement("div");
            bgLayer.className = "vpaid-background";
            bgLayer.style.backgroundImage = 'url("' + this._config.staticImageUrl + '")';
            container.appendChild(bgLayer);
        }

        // 3. Global Border (z-index: 2)
        var globalBorder = document.createElement("div");
        globalBorder.className = "vpaid-global-border";
        container.appendChild(globalBorder);

        var options = this._config.videoOptions || [];
        if (options.length < 2) {
            this._emit("AdError", "Need 2 videoOptions");
            return;
        }

        var self = this;

        function createPanel(index, option) {
            var panel = document.createElement("div");
            panel.className = "vpaid-panel " + (index === 0 ? "vpaid-panel-left" : "vpaid-panel-right");

            var frame = document.createElement("div");
            frame.className = "vpaid-frame";

            var dark = document.createElement("div");
            dark.className = "vpaid-dark";

            frame.appendChild(dark);
            panel.appendChild(frame);

            self._attachOptionClick(panel, option);

            return panel;
        }

        var panelLeft = createPanel(0, options[0]);
        var panelRight = createPanel(1, options[1]);

        // 4. Panels (z-index: 3)
        container.appendChild(panelLeft);
        container.appendChild(panelRight);

        this._slot.appendChild(container);
        this._selectorContainer = container;
    };

    /* ---------------------------------------------------------
       AUTOSTART
    ----------------------------------------------------------*/

    SelectorVPAID.prototype._setupAutoStart = function () {
        var self = this;
        this._clearAutoStart();

        if (!this._config.videoOptions || !this._config.videoOptions.length) {
            return;
        }

        this._autoStartTimer = window.setTimeout(function () {
            if (!self._currentOption) {
                self._playVideoOption(self._config.videoOptions[0], false);
            }
        }, this._config.autoStartTimeoutMs);
    };

    SelectorVPAID.prototype._clearAutoStart = function () {
        if (this._autoStartTimer) {
            window.clearTimeout(this._autoStartTimer);
            this._autoStartTimer = null;
        }
    };

    /* ---------------------------------------------------------
       PANEL CLICK
    ----------------------------------------------------------*/

    SelectorVPAID.prototype._attachOptionClick = function (element, option) {
        var self = this;
        element.addEventListener("click", function (e) {
            if (e && e.stopPropagation) {
                e.stopPropagation();
            }

            if (!self._promoActivated) {
                self._promoActivated = true;
                self._trackCustom("promo_activate", {});
            }

            self._trackCustom("element_click", { optionId: option.id });

            self._clearAutoStart();
            self._playVideoOption(option, true);
        });
    };

    /* ---------------------------------------------------------
       VIDEO PLAYBACK
    ----------------------------------------------------------*/

    SelectorVPAID.prototype._playVideoOption = function (option, userInitiated) {
        this._currentOption = option;

        if (!this._videoSlot) {
            this._emit("AdError", "No videoSlot");
            return;
        }

        if (this._selectorContainer) {
            this._selectorContainer.style.display = "none";
        }

        // Ensure video slot is visible
        if (this._videoSlot.style) {
            this._videoSlot.style.display = "block";
            this._videoSlot.style.width = "100%";
            this._videoSlot.style.height = "100%";
            this._videoSlot.style.zIndex = "10";
        }

        // Ensure slot (which holds the click layer) is ABOVE the video
        if (this._slot) {
            this._slot.style.zIndex = "20";
        }

        this._quartiles = { q25: false, q50: false, q75: false, q100: false };

        try {
            this._videoSlot.src = option.videoUrl;
        } catch (e) {
            this._emit("AdError", "Cannot set video src: " + e.message);
        }

        if (this._videoSlot.load) {
            try {
                this._videoSlot.load();
            } catch (e2) { }
        }

        if (typeof this._videoSlot.volume === "number") {
            this._videoSlot.volume = this._attributes.adVolume;
        }

        this._bindVideoEvents();
        this._bindVideoEvents();
        this._ensureVideoClickLayer();
        this._createMuteButton();

        try {
            var playPromise =
                this._videoSlot.play && this._videoSlot.play();
            if (playPromise && playPromise.then) {
                playPromise.then(
                    function () { },
                    function () { }
                );
            }
        } catch (e3) { }

        this._emit("AdVideoStart");
    };

    SelectorVPAID.prototype._bindVideoEvents = function () {
        if (!this._videoSlot || this._videoEventsBound) {
            return;
        }

        var self = this;

        this._onTimeUpdate = function () {
            self._handleTimeUpdate();
        };
        this._onEnded = function () {
            self._handleEnded();
        };

        this._videoSlot.addEventListener("timeupdate", this._onTimeUpdate);
        this._videoSlot.addEventListener("ended", this._onEnded);

        this._videoEventsBound = true;
    };

    SelectorVPAID.prototype._unbindVideoEvents = function () {
        if (!this._videoSlot || !this._videoEventsBound) {
            return;
        }
        this._videoSlot.removeEventListener("timeupdate", this._onTimeUpdate);
        this._videoSlot.removeEventListener("ended", this._onEnded);
        this._videoEventsBound = false;
    };

    /* ---------------------------------------------------------
       MUTE BUTTON
    ----------------------------------------------------------*/

    SelectorVPAID.prototype._createMuteButton = function () {
        if (this._muteButton) {
            return;
        }
        if (!this._slot) {
            return;
        }

        var btn = document.createElement("div");
        btn.className = "vpaid-mute-btn";

        var icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        icon.setAttribute("class", "vpaid-mute-icon");
        icon.setAttribute("viewBox", "0 0 24 24");

        var text = document.createElement("span");
        text.className = "vpaid-mute-text";

        btn.appendChild(icon);
        btn.appendChild(text);

        var self = this;
        btn.addEventListener("click", function (e) {
            if (e && e.stopPropagation) e.stopPropagation();
            self._toggleMute();
        });

        this._slot.appendChild(btn);
        this._muteButton = btn;
        this._updateMuteButtonState();
    };

    SelectorVPAID.prototype._toggleMute = function () {
        var newVol = (this._attributes.adVolume === 0) ? 1.0 : 0.0;
        this.setAdVolume(newVol);
        this._updateMuteButtonState();
    };

    SelectorVPAID.prototype._updateMuteButtonState = function () {
        if (!this._muteButton) return;

        var icon = this._muteButton.querySelector(".vpaid-mute-icon");
        var text = this._muteButton.querySelector(".vpaid-mute-text");
        var isMuted = (this._attributes.adVolume === 0);

        // Icons
        var iconMuted = '<path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73 4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>';
        var iconUnmuted = '<path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>';

        if (isMuted) {
            icon.innerHTML = iconMuted;
            text.textContent = "Включить звук";
        } else {
            icon.innerHTML = iconUnmuted;
            text.textContent = "Выключить звук";
        }
    };

    /* ---------------------------------------------------------
       CLICK TO SITE
    ----------------------------------------------------------*/

    SelectorVPAID.prototype._ensureVideoClickLayer = function () {
        if (!this._slot) {
            return;
        }

        var width = this._attributes.adWidth || this._slot.offsetWidth || 1280;
        var height = this._attributes.adHeight || this._slot.offsetHeight || 720;

        if (!this._videoClickLayer) {
            var layer = document.createElement("div");
            layer.style.position = "absolute";
            layer.style.left = "0";
            layer.style.top = "0";
            layer.style.width = width + "px";
            layer.style.height = height + "px";
            layer.style.cursor = "pointer";
            layer.style.backgroundColor = "rgba(0,0,0,0)";

            var self = this;
            layer.addEventListener("click", function (e) {
                if (e && e.stopPropagation) {
                    e.stopPropagation();
                }
                self._onVideoClick();
            });

            this._slot.appendChild(layer);
            this._videoClickLayer = layer;
        } else {
            this._videoClickLayer.style.display = "block";
            this._videoClickLayer.style.width = width + "px";
            this._videoClickLayer.style.height = height + "px";
        }
    };

    SelectorVPAID.prototype._onVideoClick = function () {
        var opt = this._currentOption || {};
        var url = opt.clickThroughUrl || this._config.clickThroughUrl;

        if (!url) {
            return;
        }

        this._emit("AdClickThru", url, "_blank", true);
        this._trackCustom("click_to_site", { optionId: opt.id });

        try {
            window.open(url, "_blank");
        } catch (e) { }
    };

    /* ---------------------------------------------------------
       QUARTILE TRACKING
    ----------------------------------------------------------*/

    SelectorVPAID.prototype._handleTimeUpdate = function () {
        if (!this._videoSlot || !this._currentOption) {
            return;
        }

        var dur = this._videoSlot.duration;
        var cur = this._videoSlot.currentTime;

        if (!dur || dur <= 0) {
            return;
        }

        var p = cur / dur;

        if (!this._quartiles.q25 && p >= 0.25) {
            this._quartiles.q25 = true;
            this._emit("AdVideoFirstQuartile");
            this._trackCustom("video_quartile", {
                optionId: this._currentOption.id,
                quartile: 25
            });
        }

        if (!this._quartiles.q50 && p >= 0.5) {
            this._quartiles.q50 = true;
            this._emit("AdVideoMidpoint");
            this._trackCustom("video_quartile", {
                optionId: this._currentOption.id,
                quartile: 50
            });
        }

        if (!this._quartiles.q75 && p >= 0.75) {
            this._quartiles.q75 = true;
            this._emit("AdVideoThirdQuartile");
            this._trackCustom("video_quartile", {
                optionId: this._currentOption.id,
                quartile: 75
            });
        }

        if (!this._quartiles.q100 && p >= 0.99) {
            this._quartiles.q100 = true;
            this._trackCustom("video_quartile", {
                optionId: this._currentOption.id,
                quartile: 100
            });
        }

        this._attributes.adDuration = dur;
        this._attributes.adRemainingTime = Math.max(0, dur - cur);
    };

    SelectorVPAID.prototype._handleEnded = function () {
        if (this._currentOption && !this._quartiles.q100) {
            this._quartiles.q100 = true;
            this._trackCustom("video_quartile", {
                optionId: this._currentOption.id,
                quartile: 100
            });
        }

        this._emit("AdVideoComplete");
        this._destroy();
        this._emit("AdStopped");
    };

    /* ---------------------------------------------------------
       CUSTOM PIXELS
    ----------------------------------------------------------*/

    SelectorVPAID.prototype._trackCustom = function (ev, extra) {
        if (!this._config.customPixelBaseUrl) {
            return;
        }

        var params = {};
        var base = this._config.customPixelCommonParams || {};
        var k;

        for (k in base) {
            if (Object.prototype.hasOwnProperty.call(base, k)) {
                params[k] = base[k];
            }
        }

        params.event = ev;

        var cls = "custom";
        if (ev === "promo_activate") {
            cls = "promo";
        } else if (ev === "element_click") {
            cls = "ui_click";
        } else if (ev === "click_to_site") {
            cls = "click";
        } else if (ev === "video_quartile") {
            cls = "progress";
        }
        params["class"] = cls;

        if (extra) {
            for (k in extra) {
                if (Object.prototype.hasOwnProperty.call(extra, k)) {
                    params[k] = extra[k];
                }
            }
        }

        params.rnd = Math.random().toString(16).slice(2);

        var query = [];
        for (k in params) {
            if (
                Object.prototype.hasOwnProperty.call(params, k) &&
                params[k] != null
            ) {
                query.push(
                    encodeURIComponent(k) +
                    "=" +
                    encodeURIComponent(String(params[k]))
                );
            }
        }

        var url = this._config.customPixelBaseUrl;
        if (url.indexOf("?") === -1) {
            url += "?";
        } else if (url.charAt(url.length - 1) !== "&") {
            url += "&";
        }
        url += query.join("&");

        var img = new Image();
        img.src = url;
    };

    /* ---------------------------------------------------------
       DESTROY
    ----------------------------------------------------------*/

    SelectorVPAID.prototype._destroy = function () {
        if (this._isDestroyed) {
            return;
        }
        this._isDestroyed = true;

        this._clearAutoStart();
        this._unbindVideoEvents();

        if (this._videoSlot) {
            try {
                this._videoSlot.pause();
            } catch (e) { }
        }

        if (this._videoClickLayer && this._videoClickLayer.parentNode) {
            this._videoClickLayer.parentNode.removeChild(this._videoClickLayer);
        }
        if (this._selectorContainer && this._selectorContainer.parentNode) {
            this._selectorContainer.parentNode.removeChild(this._selectorContainer);
        }

        if (this._muteButton && this._muteButton.parentNode) {
            this._muteButton.parentNode.removeChild(this._muteButton);
        }

        this._videoClickLayer = null;
        this._muteButton = null;
        this._selectorContainer = null;
        this._slot = null;
        this._videoSlot = null;
    };

    /* ---------------------------------------------------------
       INTERNAL HELPERS
    ----------------------------------------------------------*/

    SelectorVPAID.prototype._emit = function (name) {
        var args = Array.prototype.slice.call(arguments, 1);
        var subs = this._subscribers[name];
        if (!subs) {
            return;
        }
        for (var i = 0; i < subs.length; i++) {
            var s = subs[i];
            try {
                s.callback.apply(s.context, args);
            } catch (e) { }
        }
    };

    SelectorVPAID.prototype._log = function (msg, data) {
        try {
            if (window && window.console && window.console.log) {
                window.console.log("[VPAID]", msg, data || "");
            }
        } catch (e) { }
    };

    /* ---------------------------------------------------------
       GLOBAL FACTORY
    ----------------------------------------------------------*/

    function getVPAIDAd() {
        return new SelectorVPAID();
    }

    SelectorVPAID.prototype.getVPAIDAd = getVPAIDAd;

    window.getVPAIDAd = getVPAIDAd;

})(window);
