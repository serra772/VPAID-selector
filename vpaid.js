(function() {
    'use strict';

    // Конфигурация
    var config = {
        campaign_id: 'dobry_newyear_2025',
        campaign_name: 'Добрый Cola - Новогодняя кампания',
        video1: {
            url: 'https://drive.google.com/drive/folders/1PVq2H0C-KaiAN9HXTQ9g6DpXd1O4caXS',
            title: 'Открой волшебство города Лосьвилль'
        },
        video2: {
            url: 'https://drive.google.com/drive/folders/1ZQKSsnSU3jbIIk7d2G5-rP1YvhUZtuhJ',
            title: 'Узнай, какие волшебные призы ждут тебя!'
        },
        clickThroughUrl: 'https://dobrycola-promo.ru',
        autoplayDelay: 10000 // 10 секунд
    };

    // Класс для работы с пикселями
    var PixelTracker = function() {
        this.pixels = [];
        this.pixelClass = 'getshoptv-pixel'; // Класс для парсинга пикселей
    };

    PixelTracker.prototype.fire = function(url, eventName) {
        if (!url) return;

        var img = document.createElement('img');
        img.src = url;
        img.className = this.pixelClass;
        img.setAttribute('data-event', eventName || 'unknown');
        img.style.position = 'absolute';
        img.style.width = '1px';
        img.style.height = '1px';
        img.style.left = '-9999px';
        img.style.top = '-9999px';

        // Добавляем в body для отслеживания
        if (document.body) {
            document.body.appendChild(img);

            // Удаляем через 5 секунд
            setTimeout(function() {
                if (img.parentNode) {
                    img.parentNode.removeChild(img);
                }
            }, 5000);
        }

        this.pixels.push({
            url: url,
            event: eventName,
            timestamp: new Date().toISOString()
        });
    };

    PixelTracker.prototype.fireMultiple = function(urls, eventName) {
        var self = this;
        if (!urls) return;

        if (Array.isArray(urls)) {
            urls.forEach(function(url) {
                self.fire(url, eventName);
            });
        } else {
            this.fire(urls, eventName);
        }
    };

    PixelTracker.prototype.getHistory = function() {
        return this.pixels;
    };

    // Основной класс VPAID
    var VpaidAd = function() {
        this.slot_ = null;
        this.videoSlot_ = null;
        this.eventsCallbacks_ = {};
        this.attributes_ = {
            companions: '',
            desiredBitrate: 256,
            duration: 30,
            expanded: false,
            height: 0,
            icons: '',
            linear: true,
            skippableState: false,
            viewMode: 'normal',
            width: 0,
            volume: 1.0
        };

        this.quartileEvents_ = [
            {event: 'AdVideoFirstQuartile', value: 25},
            {event: 'AdVideoMidpoint', value: 50},
            {event: 'AdVideoThirdQuartile', value: 75},
            {event: 'AdVideoComplete', value: 100}
        ];
        this.nextQuartileIndex_ = 0;
        this.parameters_ = {};

        // Tracking
        this.pixelTracker_ = new PixelTracker();
        this.trackingUrls_ = {};

        // State
        this.selectedVideo_ = null;
        this.autoplayTimer_ = null;
        this.isAdPlaying_ = false;
        this.isVideoStarted_ = false;
        this.videoStartTime_ = null;
    };

    VpaidAd.prototype.handshakeVersion = function(version) {
        return '2.0';
    };

    VpaidAd.prototype.initAd = function(width, height, viewMode, desiredBitrate, creativeData, environmentVars) {
        this.attributes_.width = width;
        this.attributes_.height = height;
        this.attributes_.viewMode = viewMode;
        this.attributes_.desiredBitrate = desiredBitrate;
        this.slot_ = environmentVars.slot;
        this.videoSlot_ = environmentVars.videoSlot;

        // Parse creative data
        if (creativeData && creativeData.AdParameters) {
            try {
                this.parameters_ = JSON.parse(creativeData.AdParameters);
                this.trackingUrls_ = this.parameters_.tracking || {};
            } catch(e) {
                console.error('Failed to parse AdParameters:', e);
            }
        }

        this.createAdUI_();
        this.callEvent_('AdLoaded');
    };

    VpaidAd.prototype.createAdUI_ = function() {
        var self = this;
        var container = document.createElement('div');
        container.style.cssText = 'position:absolute;width:100%;height:100%;top:0;left:0;background:#000;font-family:Arial,sans-serif;overflow:hidden;';

        // Choice screen
        var choiceScreen = document.createElement('div');
        choiceScreen.id = 'choiceScreen';
        choiceScreen.style.cssText = 'position:absolute;width:100%;height:100%;display:flex;flex-direction:column;justify-content:center;align-items:center;background:linear-gradient(180deg, #1a1a2e 0%, #16213e 100%);z-index:10;';

        // Title
        var title = document.createElement('div');
        title.textContent = 'ПУСТЬ НОВЫЙ ГОД БУДЕТ';
        title.style.cssText = 'font-size:36px;font-weight:bold;color:#fff;margin-bottom:10px;text-align:center;padding:0 20px;text-transform:uppercase;';
        choiceScreen.appendChild(title);

        var subtitle = document.createElement('div');
        subtitle.innerHTML = 'Добрый<sup style="font-size:0.6em;">®</sup>';
        subtitle.style.cssText = 'font-size:48px;font-weight:bold;color:#d32f2f;margin-bottom:40px;text-align:center;';
        choiceScreen.appendChild(subtitle);

        // Videos container
        var videosContainer = document.createElement('div');
        videosContainer.style.cssText = 'display:flex;gap:40px;margin-bottom:30px;flex-wrap:wrap;justify-content:center;padding:0 40px;max-width:900px;';

        // Video 1
        var video1Wrapper = this.createVideoChoice_(
            'video1',
            config.video1.title,
            config.video1.url
        );
        videosContainer.appendChild(video1Wrapper);

        // Video 2
        var video2Wrapper = this.createVideoChoice_(
            'video2',
            config.video2.title,
            config.video2.url
        );
        videosContainer.appendChild(video2Wrapper);

        choiceScreen.appendChild(videosContainer);

        // Timer
        var timer = document.createElement('div');
        timer.id = 'timer';
        timer.style.cssText = 'color:#fff;font-size:18px;margin-top:20px;opacity:0.8;';
        timer.textContent = 'Автовоспроизведение через 10 секунд...';
        choiceScreen.appendChild(timer);

        container.appendChild(choiceScreen);

        // Video player (hidden initially)
        var videoPlayer = document.createElement('video');
        videoPlayer.id = 'mainVideo';
        videoPlayer.style.cssText = 'position:absolute;width:100%;height:100%;top:0;left:0;display:none;object-fit:contain;background:#000;';
        videoPlayer.setAttribute('playsinline', '');
        videoPlayer.setAttribute('webkit-playsinline', '');
        container.appendChild(videoPlayer);

        // Click overlay
        var clickOverlay = document.createElement('div');
        clickOverlay.id = 'clickOverlay';
        clickOverlay.style.cssText = 'position:absolute;width:100%;height:100%;top:0;left:0;cursor:pointer;display:none;z-index:5;';
        clickOverlay.addEventListener('click', function(e) {
            self.handleAdClick_();
        });
        container.appendChild(clickOverlay);

        this.slot_.appendChild(container);

        // Start autoplay timer
        this.startAutoplayTimer_();
    };

    VpaidAd.prototype.createVideoChoice_ = function(id, text, videoUrl) {
        var self = this;
        var wrapper = document.createElement('div');
        wrapper.className = 'video-choice';
        wrapper.dataset.videoId = id;
        wrapper.style.cssText = 'width:320px;cursor:pointer;transition:all 0.3s ease;border:4px solid transparent;border-radius:12px;overflow:hidden;background:#fff;box-shadow:0 4px 12px rgba(0,0,0,0.3);';

        var preview = document.createElement('div');
        preview.style.cssText = 'width:100%;height:220px;background:linear-gradient(135deg, #d32f2f 0%, #c62828 100%);display:flex;align-items:center;justify-content:center;position:relative;';

        var playIcon = document.createElement('div');
        playIcon.innerHTML = '▶';
        playIcon.style.cssText = 'font-size:64px;color:#fff;text-shadow:0 2px 8px rgba(0,0,0,0.3);';
        preview.appendChild(playIcon);

        wrapper.appendChild(preview);

        var label = document.createElement('div');
        label.style.cssText = 'padding:20px;background:#fff;color:#333;font-size:17px;text-align:center;font-weight:600;line-height:1.4;min-height:80px;display:flex;align-items:center;justify-content:center;';
        label.textContent = text;
        wrapper.appendChild(label);

        wrapper.addEventListener('mouseenter', function() {
            this.style.border = '4px solid #d32f2f';
            this.style.transform = 'scale(1.05) translateY(-5px)';
            this.style.boxShadow = '0 8px 20px rgba(211,47,47,0.4)';
        });

        wrapper.addEventListener('mouseleave', function() {
            this.style.border = '4px solid transparent';
            this.style.transform = 'scale(1) translateY(0)';
            this.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
        });

        wrapper.addEventListener('click', function(e) {
            e.stopPropagation();
            self.trackCustomEvent_('elementClick_' + id);
            self.selectVideo_(id, videoUrl);
        });

        return wrapper;
    };

    VpaidAd.prototype.startAutoplayTimer_ = function() {
        var self = this;
        var timeLeft = 10;
        var timerEl = document.getElementById('timer');

        this.autoplayTimer_ = setInterval(function() {
            timeLeft--;
            if (timerEl) {
                timerEl.textContent = 'Автовоспроизведение через ' + timeLeft + ' секунд...';
            }

            if (timeLeft <= 0) {
                clearInterval(self.autoplayTimer_);
                self.selectVideo_('video1', config.video1.url);
            }
        }, 1000);
    };

    VpaidAd.prototype.selectVideo_ = function(videoId, videoUrl) {
        var self = this;

        if (this.autoplayTimer_) {
            clearInterval(this.autoplayTimer_);
        }

        this.selectedVideo_ = videoId;
        this.trackCustomEvent_('promoActivation');
        this.trackCustomEvent_('videoSelected_' + videoId);

        var choiceScreen = document.getElementById('choiceScreen');
        if (choiceScreen) {
            choiceScreen.style.display = 'none';
        }

        var video = document.getElementById('mainVideo');
        var clickOverlay = document.getElementById('clickOverlay');

        if (video && clickOverlay) {
            video.src = videoUrl;
            video.style.display = 'block';
            clickOverlay.style.display = 'block';

            video.addEventListener('loadedmetadata', function() {
                self.attributes_.duration = video.duration;
            });

            video.addEventListener('timeupdate', function() {
                self.handleVideoProgress_();
            });

            video.addEventListener('ended', function() {
                self.stopAd();
            });

            video.addEventListener('play', function() {
                if (!self.videoStartTime_) {
                    self.videoStartTime_ = new Date().getTime();
                }
            });

            // Try to play
            var playPromise = video.play();
            if (playPromise !== undefined) {
                playPromise.catch(function(error) {
                    console.log('Autoplay prevented:', error);
                    video.muted = true;
                    video.play();
                });
            }

            this.isVideoStarted_ = true;
        }
    };

    VpaidAd.prototype.handleVideoProgress_ = function() {
        var video = document.getElementById('mainVideo');
        if (!video) return;

        var currentTime = video.currentTime;
        var duration = video.duration;
        var percentage = (currentTime / duration) * 100;

        if (this.nextQuartileIndex_ < this.quartileEvents_.length) {
            var nextQuartile = this.quartileEvents_[this.nextQuartileIndex_];
            if (percentage >= nextQuartile.value) {
                this.callEvent_(nextQuartile.event);
                this.trackCustomEvent_('videoView_' + this.selectedVideo_ + '_' + nextQuartile.value);
                this.nextQuartileIndex_++;
            }
        }
    };

    VpaidAd.prototype.handleAdClick_ = function() {
        this.trackClickTracking_();
        this.callEvent_('AdClickThru', config.clickThroughUrl, '0', true);
        window.open(config.clickThroughUrl, '_blank');
    };

    VpaidAd.prototype.startAd = function() {
        if (this.isAdPlaying_) return;
        this.isAdPlaying_ = true;

        this.trackImpressions_();
        this.callEvent_('AdStarted');
        this.callEvent_('AdImpression');
    };

    VpaidAd.prototype.stopAd = function() {
        if (!this.isAdPlaying_) return;

        if (this.autoplayTimer_) {
            clearInterval(this.autoplayTimer_);
        }

        var video = document.getElementById('mainVideo');
        if (video) {
            video.pause();
        }

        this.isAdPlaying_ = false;
        this.callEvent_('AdStopped');
    };

    VpaidAd.prototype.resizeAd = function(width, height, viewMode) {
        this.attributes_.width = width;
        this.attributes_.height = height;
        this.attributes_.viewMode = viewMode;
        this.callEvent_('AdSizeChange');
    };

    VpaidAd.prototype.pauseAd = function() {
        var video = document.getElementById('mainVideo');
        if (video && this.isVideoStarted_) {
            video.pause();
            this.callEvent_('AdPaused');
        }
    };

    VpaidAd.prototype.resumeAd = function() {
        var video = document.getElementById('mainVideo');
        if (video && this.isVideoStarted_) {
            video.play();
            this.callEvent_('AdPlaying');
        }
    };

    VpaidAd.prototype.expandAd = function() {
        this.attributes_.expanded = true;
        this.callEvent_('AdExpandedChange');
    };

    VpaidAd.prototype.collapseAd = function() {
        this.attributes_.expanded = false;
        this.callEvent_('AdExpandedChange');
    };

    VpaidAd.prototype.skipAd = function() {
        this.callEvent_('AdSkipped');
        this.stopAd();
    };

    VpaidAd.prototype.subscribe = function(callback, eventName, context) {
        var callbackObj = callback.bind(context);
        this.eventsCallbacks_[eventName] = callbackObj;
    };

    VpaidAd.prototype.unsubscribe = function(eventName) {
        delete this.eventsCallbacks_[eventName];
    };

    VpaidAd.prototype.getAdLinear = function() {
        return this.attributes_.linear;
    };

    VpaidAd.prototype.getAdWidth = function() {
        return this.attributes_.width;
    };

    VpaidAd.prototype.getAdHeight = function() {
        return this.attributes_.height;
    };

    VpaidAd.prototype.getAdExpanded = function() {
        return this.attributes_.expanded;
    };

    VpaidAd.prototype.getAdSkippableState = function() {
        return this.attributes_.skippableState;
    };

    VpaidAd.prototype.getAdRemainingTime = function() {
        var video = document.getElementById('mainVideo');
        if (video && this.isVideoStarted_) {
            return video.duration - video.currentTime;
        }
        return this.attributes_.duration;
    };

    VpaidAd.prototype.getAdDuration = function() {
        return this.attributes_.duration;
    };

    VpaidAd.prototype.getAdVolume = function() {
        var video = document.getElementById('mainVideo');
        if (video && this.isVideoStarted_) {
            return video.volume;
        }
        return this.attributes_.volume;
    };

    VpaidAd.prototype.setAdVolume = function(volume) {
        this.attributes_.volume = volume;
        var video = document.getElementById('mainVideo');
        if (video && this.isVideoStarted_) {
            video.volume = volume;
        }
        this.callEvent_('AdVolumeChange');
    };

    VpaidAd.prototype.getAdCompanions = function() {
        return this.attributes_.companions;
    };

    VpaidAd.prototype.getAdIcons = function() {
        return this.attributes_.icons;
    };

    VpaidAd.prototype.callEvent_ = function(eventName) {
        if (this.eventsCallbacks_[eventName]) {
            this.eventsCallbacks_[eventName]();
        }
    };

    VpaidAd.prototype.trackImpressions_ = function() {
        var urls = this.trackingUrls_.impression || [];
        this.pixelTracker_.fireMultiple(urls, 'impression');
    };

    VpaidAd.prototype.trackClickTracking_ = function() {
        var urls = this.trackingUrls_.click || [];
        this.pixelTracker_.fireMultiple(urls, 'click');
    };

    VpaidAd.prototype.trackCustomEvent_ = function(eventName) {
        var urls = this.trackingUrls_[eventName] || [];
        this.pixelTracker_.fireMultiple(urls, eventName);
    };

    // Global function
    var getVPAIDAd = function() {
        return new VpaidAd();
    };

    if (typeof define === 'function' && define.amd) {
        define([], function() {
            return getVPAIDAd;
        });
    } else if (typeof module === 'object' && module.exports) {
        module.exports = getVPAIDAd;
    } else {
        window.getVPAIDAd = getVPAIDAd;
    }
})();
