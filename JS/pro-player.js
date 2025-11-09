import WaveSurfer from './WAVE/wavesurfer.esm.js';
import RegionsPlugin from './WAVE/wavesurfer.regions.esm.js';
import Soundfont from './WAVE/soundfont-player.js';
//console.log(Soundfont);

console.log('Pro Player');


export class ProPlayer {
    constructor(obj = {}) {
        this.url = obj.url || '../AUDIO/4.mp3';
        this.sox_url = obj.sox_url || '../process-sox.php';
        this.regions = null;
        this.region = null;
        this.ws = null;
        this.pitchFactor = 1.0;
        this.loop = false;
        this.peaks = null;
        this.wave_color = obj.wave_color || 'rgba(15, 30, 70, 0.95)';          
        this.progress_color = obj.progress_color || 'rgba(25, 60, 130, 0.95)'; 
        this.region_colors = obj.region_colors || 'rgba(123, 237, 159, 0.35)'; 
        
        this.start_pos = 0;
        this.pausePos = 0;
        this.loopStart = 0;
        this.loopEnd = 0;
        this.canPause = false;

        this.pianoInstrument = null;
        
        this.handle = null;
        this.scroll = null;
    }
    start = (th = this) => {
        $('#start-btn').on('click',(e) => {
            console.log('Start');
            
            $(e.target).remove();
            $('.loading-audio').removeClass('d-none');
            th.loadWs();
        });
    }
    loadWs = (th = this) => {
        th.regions = RegionsPlugin.create();
        th.ws = WaveSurfer.create({
            container: '#waveform',
            waveColor: th.wave_color,
            progressColor: th.progress_color,
            url: th.url,
            plugins: [th.regions],
            backend: 'WebAudio'
        });
        th.regions.enableDragSelection({
            color: th.region_colors,
            resize: true,
            drag: true,
            slop: 2,
        });
        th.ws.once('ready', async () => {
            const bpm = await th.getBPM();
            if (bpm >= 10 && bpm <= 500){
                $('#bpm-info').html('BPM: '+bpm);
            }
            else {
                $('#bpm-info').html('BPM: ---');
            }


            const interval = setInterval(() => {
                const canvas = th.ws.renderer.canvasWrapper.querySelector('canvas');
                th.handle = $('#scroll-handle');
                th.scroll = th.ws.renderer.scrollContainer;

                if (th.scroll) {
                    th.scroll.style.overflow = 'auto'; // чтобы скролл работал
                    th.scroll.style.scrollbarWidth = 'none'; // Firefox
                    th.scroll.style.msOverflowStyle = 'none'; // IE и старые Edge
        
                    // Chrome, Safari, Opera, Edge Chromium
                    const style = document.createElement('style');
                    style.textContent = `
                        #${scroll.id}::-webkit-scrollbar {
                            display: none !important;
                            width: 0 !important;
                            height: 0 !important;
                        }
                    `;
                    document.head.appendChild(style);
                }
                if (canvas) {
                    clearInterval(interval);
                    const miniCanvas = document.getElementById('mini-wave');
                    miniCanvas.width = canvas.width;
                    miniCanvas.height = 40;
                    const ctx = miniCanvas.getContext('2d');
                    ctx.drawImage(canvas, 0, 0, canvas.width, miniCanvas.height);
                    th.addZoomEvents();
                }
            }, 50);
            $('.loading-audio').animate({opacity : 0},300,() => {
                $('.loading-audio').addClass('d-none');
                th.addPianoRoll();
                $('#player-container').toggleClass('d-none d-block');
                th.addWsEvents();
                th.addTransportEvents();
                th.addRegionEvents();
                th.addSoxEvents();
                th.addPianoEvents();
            });    
        });
    };
    
    async getBPM() {
        if (!this.ws) return console.warn('Wavesurfer не инициализирован');
      
        try {
          const audioBuffer = this.ws.getDecodedData?.();
          if (!audioBuffer) return console.warn('AudioBuffer отсутствует');
            
            const left = audioBuffer.getChannelData(0);
            const right = audioBuffer.getChannelData(1);
            const combined = left.map((v, i) => (v + right[i]) / 2);
            const channelData = combined;
      
          // детектор пиков с динамическим порогом
          const peaks = [];
          const mean = channelData.reduce((a, b) => a + Math.abs(b), 0) / channelData.length;
          const threshold = mean * 2; 
          const skip = Math.floor(audioBuffer.sampleRate * 0.25); // ~1/4 секунды
      
          for (let i = 0; i < channelData.length; i++) {
            if (Math.abs(channelData[i]) > threshold) {
              peaks.push(i);
              i += skip;
            }
          }
      
          if (peaks.length < 2) {
            console.warn('Недостаточно пиков для определения BPM');
            return null;
          }
      
          // интервалы между пиками
          const intervals = [];
          for (let i = 0; i < peaks.length - 1; i++) {
            intervals.push(peaks[i + 1] - peaks[i]);
          }
      
          // конвертация в BPM
          const bpmCandidates = intervals.map(i => 60 / (i / audioBuffer.sampleRate));
      
          // усреднение и коррекция диапазона
          let bpm = bpmCandidates.reduce((a, b) => a + b, 0) / bpmCandidates.length;
      
          // приводим к диапазону 60–180
          while (bpm > 180) bpm /= 2;
          while (bpm < 40) bpm *= 2;
      
          bpm = Math.round(bpm);
          return bpm;
      
        } catch (err) {
          console.error('Ошибка при определении BPM:', err);
        }
    }
      

    addPianoRoll = () => {
        const $pianoRoll = $('.piano-roll');
        const octavePattern = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        for (let i = 0; i < 88; i++) {
            const octaveIndex = Math.floor((i + 9) / 12);
            const noteIndex = (i + 9) % 12;
            const note = octavePattern[noteIndex] + octaveIndex;
            const midi = i + 21;
            if (!octavePattern[noteIndex].includes('#')) {
                const $whiteKey = $(`<div class="white-key" data-note="${note}" data-midi="${midi}"></div>`);
                $pianoRoll.append($whiteKey);
            } else {
                const $blackKey = $(`<div class="black-key" data-note="${note}" data-midi="${midi}"></div>`);
                const $lastWhite = $pianoRoll.find('.white-key').last();
                $lastWhite.append($blackKey);
            }
        }
    };
    async addPianoEvents(containerSelector = '.piano-roll', instrumentName = 'acoustic_grand_piano') {
        // Загружаем инструмент
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        this.audioCtx = new AudioContext();
        this.pianoInstrument = await Soundfont.instrument(this.audioCtx, instrumentName);
        this.pianoGain = this.audioCtx.createGain();
        this.pianoGain.gain.value = 1; // от 0.0 до 1.0, 1.0 — максимальная громкость
        this.pianoInstrument.connect(this.pianoGain);
        this.pianoGain.connect(this.audioCtx.destination);
        const container = document.querySelector(containerSelector);
        if (!container) return;

        container.addEventListener('mousedown', (e) => {
            const key = e.target.closest('.white-key, .black-key');
            if (!key) return;
        
            const note = key.dataset.note;
            if (!note) return;
        
            // Добавляем класс активной клавиши
            key.classList.add('active2');
        
            // Проигрываем ноту
            this.pianoInstrument.play(note);
        
            // Убираем класс после окончания проигрывания или через небольшую задержку
            setTimeout(() => key.classList.remove('active2'), 150);
        });
        
        // Чтобы клавиши можно было нажимать мышью + удерживать
        container.addEventListener('mouseenter', (e) => {
            if (e.buttons === 1) { // левая кнопка зажата
                const key = e.target.closest('.white-key, .black-key');
                if (!key) return;
        
                const note = key.dataset.note;
                if (!note) return;
        
                key.classList.add('active2');
                this.pianoInstrument.play(note);
                setTimeout(() => key.classList.remove('active2'), 150);
            }
        });
        $('.load-piano').remove();
    };

    addWsEvents = (th = this) => {
        // Обновляем позицию и обрабатываем зацикливание
        th.ws.on('audioprocess', (currentTime) => {
            th.pausePos = currentTime;
    
            // Если включен loop
            if (th.loop) {
                if (th.region) {
                    // Зацикливаем регион
                    if (currentTime >= th.region.end - 0.03) {
                        th.ws.setTime(th.region.start);
                    }
                } else {
                    // Зацикливаем всю запись
                    const duration = th.ws.getDuration();
                    if (currentTime >= duration - 0.03) {
                        th.ws.setTime(0);
                    }
                }
            }
        });
    
        // Когда воспроизведение доходит до конца (на всякий случай)
        th.ws.on('finish', () => {
            if (th.loop) {
                if (th.region) {
                    th.ws.play(th.region.start, th.region.end);
                } else {
                    th.ws.play(0);
                }
            }
        });
    
        // Клик по волне — обновляем стартовую позицию
        th.ws.on('interaction', () => {
            th.start_pos = th.ws.getCurrentTime();
        });
    };
    addZoomEvents = (th = this) => {
        const $waveform = $('#waveform');
        const $zoomInput = $('#zoom-range');
        const zoomSensitivity = 1;
        const handle = th.handle;   // jQuery handle
        const scroll = th.scroll;   // DOM-элемент, где крутится волна
        let initialDistance = null;
        let startX = 0;
        let startY = 0;
        let isDragging = false;
        let startHX = 0;
        let startHLeftPx = 0;
        let relativeLeft = 0; // 0..1
    
        // -------------------- Вспомогательные функции --------------------
    
        const getMaxScroll = () => scroll.scrollWidth - scroll.clientWidth;
        const getMaxHandleLeft = () => handle.parent().width() - handle.outerWidth();
    
        // handle ← scroll
        const updateHandleFromScroll = () => {
            const maxScroll = getMaxScroll();
            const maxLeft = getMaxHandleLeft();
            const currentScroll = scroll.scrollLeft;
            const relative = maxScroll > 0 ? currentScroll / maxScroll : 0;
            const newLeft = relative * maxLeft;
            handle.css('left', newLeft + 'px');
            relativeLeft = relative;
        };
    
        // scroll ← handle
        const updateScrollFromHandle = (newLeftPx) => {
            const maxLeft = getMaxHandleLeft();
            const maxScroll = getMaxScroll();
            const relative = maxLeft > 0 ? newLeftPx / maxLeft : 0;
            scroll.scrollLeft = relative * maxScroll;
            relativeLeft = relative;
        };
    
        // -------------------- Drag Handle --------------------
        handle.on('mousedown.c', function (e) {
            isDragging = true;
            startHX = e.pageX;
            startHLeftPx = parseInt(handle.css('left')) || 0;
            e.preventDefault();
        });
    
        $(document).on('mousemove.c', function (e) {
            if (!isDragging) return;
    
            const dx = e.pageX - startHX;
            let newLeftPx = startHLeftPx + dx;
    
            const parentWidth = handle.parent().width();
            const handleWidth = handle.outerWidth();
            newLeftPx = Math.max(0, Math.min(newLeftPx, parentWidth - handleWidth));
    
            handle.css('left', newLeftPx + 'px');
            updateScrollFromHandle(newLeftPx);
        });
    
        $(document).on('mouseup.c', function () {
            isDragging = false;
        });
    
        // -------------------- Scroll → Handle --------------------
        scroll.addEventListener('scroll', () => {
            if (!isDragging) {
                updateHandleFromScroll();
            }
        });
    
        // -------------------- Zoom Function --------------------
        const setZoom = (val) => {
            val = Math.max(1, Math.min(500, val));
            $zoomInput.val(val);
    
            th.ws.zoom(val);
    
            const miniCanvas = document.getElementById('mini-wave');
            if (miniCanvas && handle.length) {
                const handleWidth = miniCanvas.width / val;
                handle.css({ width: handleWidth + 'px' });
            }
    
            updateHandleFromScroll(); // пересчитать позицию handle после zoom
        };
    
        $zoomInput.on('input', function () {
            setZoom(Number($(this).val()));
        });
    
        // -------------------- Mouse Wheel Zoom --------------------
        $waveform.on('wheel', function (e) {
            const ev = e.originalEvent;
            const deltaY = ev.deltaY;
    
            if (Math.abs(deltaY) > Math.abs(ev.deltaX)) {
                e.preventDefault();
                let currentVal = Number($zoomInput.val());
                setZoom(currentVal - deltaY / zoomSensitivity);
            }
        });
    
        // -------------------- Keyboard Zoom --------------------
        $(document).on('keydown', function (e) {
            let currentVal = Number($zoomInput.val());
            if (e.key === 'ArrowUp') {
                setZoom(currentVal + 5);
                e.preventDefault();
            } else if (e.key === 'ArrowDown') {
                setZoom(currentVal - 5);
                e.preventDefault();
            }
        });
    
        // -------------------- Touch Zoom --------------------
        $waveform.on('touchstart', function (e) {
            if (e.touches.length === 2) {
                const [t1, t2] = e.touches;
                initialDistance = Math.hypot(t2.pageX - t1.pageX, t2.pageY - t1.pageY);
            } else if (e.touches.length === 1) {
                startX = e.touches[0].pageX;
                startY = e.touches[0].pageY;
            }
        }, { passive: false });
    
        $waveform.on('touchmove', function (e) {
            if (e.touches.length === 2 && initialDistance) {
                const [t1, t2] = e.touches;
                const newDistance = Math.hypot(t2.pageX - t1.pageX, t2.pageY - t1.pageY);
                const diff = newDistance - initialDistance;
    
                let currentVal = Number($zoomInput.val());
                setZoom(currentVal + diff / 2);
                initialDistance = newDistance;
                e.preventDefault();
            } else if (e.touches.length === 1) {
                const dx = e.touches[0].pageX - startX;
                const dy = e.touches[0].pageY - startY;
                if (Math.abs(dx) > Math.abs(dy)) e.preventDefault();
            }
        }, { passive: false });
    
        $waveform.on('touchend touchcancel', function (e) {
            if (e.touches.length < 2) initialDistance = null;
        });

        const miniCanvas = document.getElementById('mini-wave');
        if (miniCanvas) {
            miniCanvas.addEventListener('click', (e) => {
                const rect = miniCanvas.getBoundingClientRect();
                const clickX = e.clientX - rect.left; // позиция клика внутри mini-wave
        
                const parentWidth = handle.parent().width();
                const handleWidth = handle.outerWidth();
        
                // вычисляем новую позицию handle (центр совпадает с кликом)
                let newLeftPx = clickX - handleWidth / 2;
                newLeftPx = Math.max(0, Math.min(newLeftPx, parentWidth - handleWidth));
        
                // двигаем handle
                handle.css('left', newLeftPx + 'px');
        
                // прокручиваем scroll
                const maxLeft = parentWidth - handleWidth;
                const relative = maxLeft > 0 ? newLeftPx / maxLeft : 0;
                const maxScroll = scroll.scrollWidth - scroll.clientWidth;
                scroll.scrollLeft = relative * maxScroll;
            });
        }
        // -------------------- Инициализация --------------------
        updateHandleFromScroll();
    };
    addTransportEvents = (th = this) => {
        const playFromStartPos = () => {
            th.canPause = true;
            const isPlaying = th.ws.isPlaying();
    
            if (isPlaying) {
                th.ws.pause();
                // th.ws.play(th.start_pos); // если нужно сразу с позиции
            } else {
                th.ws.play(th.start_pos);
            }
        };
        // -------------------- Loop --------------------
        $('#loop-repeat').on('click', function () {
            $(this).toggleClass('active btn-success btn-outline-success');
            th.loop = $(this).hasClass('active');
        });
        // -------------------- Play --------------------
        $('#play').on('click', () => {
            if ($('#pause').hasClass('active')) {
                $('#pause').toggleClass('active btn-info btn-outline-info');
            }
            playFromStartPos();
        });
        // -------------------- Pause --------------------
        $('#pause').on('click', function () {
            if (!th.canPause) return;
            $(this).toggleClass('active btn-info btn-outline-info');
            if ($(this).hasClass('active')) {
                th.ws.pause();
            } else {
                th.ws.play(th.pausePos);
            }
        });
        // -------------------- Stop --------------------
        $('#stop').on('click', () => {
            th.canPause = false;
            if ($('#pause').hasClass('active')) {
                $('#pause').toggleClass('active btn-info btn-outline-info');
            }
            th.ws.stop();
            th.ws.seekTo(th.start_pos / th.ws.getDuration());
        });    
        // -------------------- Space = Play --------------------
        $(document).off('keydown.playToggle').on('keydown.playToggle', (e) => {
            if (e.code === 'Space' && !e.repeat) {
                e.preventDefault();
                playFromStartPos();
            }
        });
    };
    addRegionEvents = (th = this) => {
    
        // Создание региона
        th.regions.on('region-created', (region) => {
    
            // Если уже есть регион — удаляем старый
            if (th.region && th.region !== region) {
                th.region.remove();
            }
    
            // Сохраняем новый
            th.region = region;
    
            // Настройки внешнего вида и поведения
            th.region.setOptions({
                color: th.region_colors,
                drag: true,
                resize: true
            });
    
            // Кнопка удаления региона
            const $closeBtn = $('<div class="close-region">×</div>').css({
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                padding: '.3rem',
                height: '.8rem',
                aspectRatio: '1 / 1',
                position: 'absolute',
                right: '-1.4rem',
                top: '.3rem',
                cursor: 'pointer',
                fontSize: '1rem',
                color: 'rgb(255, 255, 255)',
                backgroundColor: 'rgba(0, 0, 0, .7)',
                lineHeight: 1,
                borderTopRightRadius: '50%',
                borderBottomRightRadius: '50%'
            });
    
            // Подождём, пока элемент появится в DOM
            const checkRegion = setInterval(() => {
                if (th.region.element) {
                    $(th.region.element).append($closeBtn);
                    clearInterval(checkRegion);
    
                    // Обработчик удаления региона
                    $closeBtn.on('click', (e) => {
                        e.stopPropagation();
                        th.region.remove();
                        th.region = null;
                    });
                }
            }, 10);
    
            // Анализ частот после создания
            th.analyzeFrequencies();
        });
    
        // Обновление региона
        th.regions.on('region-updated', (region) => {
            th.region = region;
            th.analyzeFrequencies();
        });
    
        // Удаление региона
        th.regions.on('region-removed', () => {
            th.region = null;
    
            // Очистка интерфейса
            $('#sox-autotune-btn').prop('disabled', true);
            th.peaks = null;
    
            const canvas = document.querySelector('.frequency-graph');
            if (canvas) {
                const ctx = canvas.getContext('2d');
                ctx.clearRect(0, 0, canvas.width, canvas.height);
    
                const pianoRoll = document.querySelector('.piano-roll');
                if (pianoRoll) {
                    pianoRoll.querySelectorAll('.white-key, .black-key')
                        .forEach(k => k.classList.remove('active'));
                }
            }
        });
    };
    addSoxEvents = (th = this) => {
        $('.soxModal').on('show.bs.modal', function (e) {
            if (th.peaks != null){
                if (th.peaks.length > 0){
                    const cents = th.calculateFundamentalError(th.peaks);
                    if (cents != null && (cents >= -50 && cents <=50)) {
                        $('#sox-autotune-btn').prop('disabled', false);
                    }
                }
            }
            
        });
        $('#sox-autotune-btn').on('click',function(){
            const cents = th.calculateFundamentalError(th.peaks) ?? '';
            if (cents < -50 && cents >50) return;
            // Устанавливаем значение
            const val = Number($('#sox-cents-number').val());
            $('#sox-cents-number').val(val + cents);

            // И триггерим событие input
            $('#sox-cents-number').trigger('input');
            
        });
        $('#sox-pitch-slider').on('input',(e) => {
            $('#sox-pitch-number').val(e.target.value);
            $('#sox-semitons').html(e.target.value);
        });
        $('#sox-pitch-number').on('input',(e) => {
            $('#sox-pitch-slider').val(e.target.value);
            $('#sox-semitons').html(e.target.value);
        });
        $('#sox-cents-slider').on('input',(e) => {
            $('#sox-cents-number').val(e.target.value);
            $('#sox-cents').html(e.target.value);
        });
        $('#sox-cents-number').on('input',(e) => {
            $('#sox-cents-slider').val(e.target.value);
            $('#sox-cents').html(e.target.value);
        });

        $('#speed-range').on('input', (e) => {
            const value = parseFloat(e.target.value);
            $('#speed-number').val(Math.round(value * 100));
            $('#sox-speed').html(Math.round(value * 100)+'%');
        });
        $('#speed-number').on('input', (e) => {
            let value = parseFloat(e.target.value);
            if (isNaN(value)) value = 100;
            if (value < 50) value = 50;
            if (value > 300) value = 300;
            $('#speed-range').val(value / 100); // переводим обратно в коэффициент
            $('#sox-speed').html(e.target.value + '%');
        });

        $('#sox-reset-btn').on('click',()=>{
            $('#speed-range').val(1);
            $('#sox-pitch-slider').val(0);
            $('#sox-cents-slider').val(0);
        });
        $('#sox-process-btn').on('click', async (e) => { 
            alert('Sox не работает в демо версии!!!');
            return false;
            const speed = parseFloat($('#speed-range').val());
            const semitones = parseInt($('#sox-pitch-slider').val(), 10); 
            const cents = parseInt($('#sox-cents-slider').val(), 10);     
            let totalCents = semitones * 100 + cents;

            // Округляем до целого числа
            totalCents = Math.round(totalCents);
            const fileUrl = th.url; // основной URL (может быть ./ или https://)
    
            
            // Определяем тип обработки
            $('#sox-status').html('<span class="text-success">Обработка на сервере...</span>');
            $(e.target).prop('disabled', true);
        
            try {
                const formData = new FormData();
                //formData.append('method', method);
                formData.append('pitch', totalCents.toString());
                formData.append('speed', speed.toString());
                formData.append('fileUrl', fileUrl);
        
                const response = await fetch(th.sox_url, {
                    method: 'POST',
                    body: formData
                });
        
                if (!response.ok) {
                    const text = await response.text();
                    throw new Error(`Server error: ${response.status} — ${text}`);
                }
        
                const processedBlob = await response.blob();
                const processedUrl = URL.createObjectURL(processedBlob);
        
                // Загружаем в плеер (заменяем оригинал)
                await th.ws.load(processedUrl);
                $(e.target).prop('disabled', false);


                const audioBuffer = th.ws.getDecodedData?.();
                const bpm = await th.getBPM();
                if (bpm >= 10 && bpm <= 500){
                    $('#bpm-info').html('BPM: '+bpm);
                }
                else {
                    $('#bpm-info').html('BPM: ---');
                }
                $('#sox-status').html(`<span class="text-success">Обработка завершена</span>`);
                $('.soxModal').modal('hide');
                if (th.region) th.analyzeFrequencies();

            } catch (error) {
                console.error('SoX Error:', error);
                $('#sox-status').html(`<span class="text-danger">Ошибка: ${error.message}</span>`);
            }
        });
        
    }
    calculateFundamentalError = (peaks) => {
        if (!peaks || !peaks.length) return null;
    
        // Эталонные частоты нот в Гц
        const referenceNotes = [
            32.70, 36.71, 41.20, 43.65, 49.00, 55.00, 61.74, 65.41, 73.42, 82.41, 87.31, 98.00, 110.00,
            123.47, 130.81, 146.83, 164.81, 174.61, 196.00, 220.00, 246.94, 261.63, 293.66, 329.63,
            349.23, 392.00, 440.00, 493.88, 523.25, 587.33, 659.25
        ];
    
        // Находим самый громкий пик (по amplitudeLinear)
        let fundamental = peaks.reduce((max, p) => 
            p.amplitudeLinear > max.amplitudeLinear ? p : max, peaks[0]
        );
    
        const freq = parseFloat(fundamental.freq);
    
        // Находим ближайшую эталонную ноту
        let closest = referenceNotes.reduce((prev, curr) =>
            Math.abs(curr - freq) < Math.abs(prev - freq) ? curr : prev
        );
    
        // Вычисляем погрешность в центах
        const centError = 1200 * Math.log2(freq / closest);
    
        // Возвращаем только если ошибка <= 25 центов
        return Math.abs(centError) <= 25 ? Math.round(centError) : null;
    };
    analyzeFrequencies = (th = this) => {
        const audioBuffer = th.ws.getDecodedData?.();
        if (!audioBuffer) {
            console.warn('⚠️ Аудио не загружено или ещё не декодировано');
            return;
        }
      
        const sampleRate = audioBuffer.sampleRate;
        const startSample = Math.floor(th.region.start * sampleRate);
        const endSample = Math.floor(th.region.end * sampleRate);
        const left = audioBuffer.getChannelData(0);
        const right = audioBuffer.getChannelData(1);
        const combined = left.map((v, i) => (v + right[i]) / 2);
        const channelData = combined.slice(startSample, endSample);
      
        if (channelData.length < 512) {
            console.warn('⚠️ Регион слишком короткий для анализа');
            return;
        }
      
        const offlineCtx = new OfflineAudioContext(1, channelData.length, sampleRate);
        const buffer = offlineCtx.createBuffer(1, channelData.length, sampleRate);
        buffer.copyToChannel(channelData, 0);
      
        const source = offlineCtx.createBufferSource();
        source.buffer = buffer;
      
        const analyser = offlineCtx.createAnalyser();
        if (Math.pow(2, Math.floor(Math.log2(channelData.length))) <= 32768){
            analyser.fftSize = Math.pow(2, Math.floor(Math.log2(channelData.length)));
        }
        else {
            analyser.fftSize = 32768;
        }
        
        source.connect(analyser);
        analyser.connect(offlineCtx.destination);
        source.start();
      
        offlineCtx.startRendering().then(() => {
            const freqData = new Float32Array(analyser.frequencyBinCount);
            analyser.getFloatFrequencyData(freqData);
      
            const peaks = [];
            for (let i = 1; i < freqData.length - 1; i++) {
                if (freqData[i] > freqData[i - 1] && freqData[i] > freqData[i + 1]) {
                    let freq = (i * sampleRate) / analyser.fftSize;
                    freq *= th.pitchFactor; 
                    const amplitude = freqData[i];
                    peaks.push({ freq, amplitude });
                }
            }
      
            if (!peaks.length) {
                console.warn('⚠️ Не удалось обнаружить пиковые частоты');
                return;
            }
      
            const topPeaks = peaks
                .filter(p => p.freq >= 32.7)
                .sort((a, b) => b.amplitude - a.amplitude)
                .slice(0, 13)
                .map(p => ({
                    freq: p.freq.toFixed(2),
                    note: th.frequencyToNoteName(p.freq),
                    amplitudeLinear: Math.pow(10, p.amplitude / 20),
                }));
      
                topPeaks.sort((a, b) => parseFloat(a.freq) - parseFloat(b.freq));
                th.drawFrequencyCurve(topPeaks);
            }).catch((err) => {
            console.error('Ошибка при рендеринге:', err);
            }
        );
    }
    frequencyToNoteName(frequency) {
        const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        if (!frequency || frequency <= 0) return '—';
        const A4 = 440;
        const semitone = 12 * Math.log2(frequency / A4);
        const noteIndex = Math.round(semitone) + 69;
        const name = noteNames[noteIndex % 12];
        const octave = Math.floor(noteIndex / 12) - 1;
        return `${name}${octave}`;
    }
    drawFrequencyCurve(peaks, th = this) {
        if (!peaks.length) return;
    
        th.peaks = JSON.parse(JSON.stringify(peaks));
    
        const canvas = document.querySelector('.frequency-graph');
        const ctx = canvas.getContext('2d');
        const pianoRoll = document.querySelector('.piano-roll');
    
        // Подгоняем canvas под размеры pianoRoll
        const rollWidth = pianoRoll.scrollWidth;
        canvas.width = rollWidth;
        canvas.height = 50;
        canvas.style.width = rollWidth + 'px';
        canvas.style.height = '50px';
    
        // Функции перевода частоты ↔ MIDI
        const freqToMIDI = freq => 69 + 12 * Math.log2(freq / 440);
        const midiToFreq = midi => 440 * Math.pow(2, (midi - 69) / 12);
    
        // Амплитудный масштаб
        const maxAmp = Math.max(...peaks.map(p => p.amplitudeLinear));
        const k = maxAmp > 0 ? (canvas.height * 0.9) / maxAmp : 1;
    
        // Очистка подсветки клавиш
        pianoRoll.querySelectorAll('.white-key, .black-key').forEach(k => k.classList.remove('active'));
    
        // Составляем массивы клавиш с их координатами
        const whiteKeys = {};
        const blackKeys = {};
        let xPos = 0;
        pianoRoll.querySelectorAll('.white-key').forEach(wk => {
            const midi = parseInt(wk.dataset.midi);
            whiteKeys[midi] = { x: xPos, width: wk.offsetWidth };
            xPos += wk.offsetWidth;
        });
        pianoRoll.querySelectorAll('.black-key').forEach(bk => {
            const midi = parseInt(bk.dataset.midi);
            const parentWhite = bk.parentElement;
            const px = parentWhite.offsetLeft + parentWhite.offsetWidth - bk.offsetWidth / 2;
            blackKeys[midi] = { x: px, width: bk.offsetWidth };
        });
    
        // Построение точек кривой
        const points = [];
        peaks.forEach(p => {
            const freq = parseFloat(p.freq);
            const midi = Math.round(freqToMIDI(freq));
    
            // Выбираем клавишу по ноте
            const keyInfo = blackKeys[midi] || whiteKeys[midi];
            if (!keyInfo) return;
    
            // Смещение в полутоне относительно следующей клавиши
            const nextFreq = midiToFreq(midi + 1);
            const prevFreq = midiToFreq(midi);
            const freqRatio = (freq - prevFreq) / (nextFreq - prevFreq);
    
            const nextKeyInfo = blackKeys[midi + 1] || whiteKeys[midi + 1] || { x: keyInfo.x + keyInfo.width, width: keyInfo.width };
            const x = keyInfo.x + keyInfo.width / 2 + freqRatio * (nextKeyInfo.x - keyInfo.x - keyInfo.width / 2);
            const y = canvas.height - p.amplitudeLinear * k;
    
            points.push({ x, y });
    
            // Подсветка клавиши
            const noteSelector = p.note.includes('#')
                ? `.black-key[data-note="${p.note}"]`
                : `.white-key[data-note="${p.note}"]`;
            const keyElem = pianoRoll.querySelector(noteSelector);
            if (keyElem) keyElem.classList.add('active');
        });
    
        // Отрисовка кривой
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        if (points.length > 0) {
            ctx.beginPath();
            ctx.moveTo(points[0].x, canvas.height);
            points.forEach((p, i) => {
                const prevX = i > 0 ? points[i - 1].x : p.x - 10;
                const nextX = i < points.length - 1 ? points[i + 1].x : p.x + 10;
                const cp1x = (prevX + p.x) / 2;
                const cp2x = (p.x + nextX) / 2;
                ctx.quadraticCurveTo(cp1x, canvas.height, p.x, p.y);
                ctx.quadraticCurveTo(cp2x, canvas.height, nextX, canvas.height);
            });
            ctx.strokeStyle = 'red';
            ctx.lineWidth = 2;
            ctx.stroke();
        }
    
        // Отметки пиков и вертикальные линии
        peaks.forEach(p => {
            const freq = parseFloat(p.freq);
            const midi = Math.round(freqToMIDI(freq));
            const keyInfo = blackKeys[midi] || whiteKeys[midi];
            if (!keyInfo) return;
    
            const nextFreq = midiToFreq(midi + 1);
            const prevFreq = midiToFreq(midi);
            const freqRatio = (freq - prevFreq) / (nextFreq - prevFreq);
    
            const nextKeyInfo = blackKeys[midi + 1] || whiteKeys[midi + 1] || { x: keyInfo.x + keyInfo.width, width: keyInfo.width };
            const x = keyInfo.x + keyInfo.width / 2 + freqRatio * (nextKeyInfo.x - keyInfo.x - keyInfo.width / 2);
            const y = canvas.height - p.amplitudeLinear * k;
    
            // Точки
            ctx.beginPath();
            ctx.arc(x, y, 3, 0, Math.PI * 2);
            ctx.fillStyle = 'blue';
            ctx.fill();
    
            // Вертикальные линии
            ctx.beginPath();
            ctx.setLineDash([4, 4]);
            ctx.moveTo(x, y);
            ctx.lineTo(x, canvas.height);
            ctx.strokeStyle = 'gray';
            ctx.lineWidth = 1;
            ctx.stroke();
            ctx.setLineDash([]);
        });
    } 
}
//const my_player = new ProPlayer().start();
