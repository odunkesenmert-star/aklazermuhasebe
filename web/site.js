(function () {
    const weightApi = window.AkLazerWeight;
    const quoteStorageKey = 'akLazerSheetQuote';
    const heroVideoTimeKey = 'akLazerHeroVideoTime';
    const whatsappNumber = '905375883195';

    function qs(selector) {
        return document.querySelector(selector);
    }

    function qsa(selector) {
        return Array.from(document.querySelectorAll(selector));
    }

    function formatKg(value) {
        return value.toLocaleString('tr-TR', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
    }

    function formatMoney(value) {
        return value.toLocaleString('tr-TR', { style: 'currency', currency: 'TRY' });
    }

    function readNumber(id) {
        const el = document.getElementById(id);
        return el ? Number(el.value) : 0;
    }

    function encodeMessage(value) {
        return encodeURIComponent(value).replace(/%20/g, '+');
    }

    function getCalculatorPayload() {
        const materialSelect = document.getElementById('material');
        const selectedMaterial = materialSelect?.selectedOptions?.[0]?.textContent || '';
        const lengthMm = readNumber('lengthMm');
        const widthMm = readNumber('widthMm');
        const thicknessMm = readNumber('thicknessMm');
        const quantity = readNumber('quantity');
        const density = readNumber('density');
        const pricePerKg = readNumber('pricePerKg');
        const singleWeight = weightApi.calculateSheetWeightKg(lengthMm, widthMm, thicknessMm, density, 1);
        const totalWeight = weightApi.calculateSheetWeightKg(lengthMm, widthMm, thicknessMm, density, quantity);
        const totalPrice = pricePerKg > 0 ? totalWeight * pricePerKg : 0;

        return {
            material: selectedMaterial,
            lengthMm,
            widthMm,
            thicknessMm,
            quantity,
            density,
            pricePerKg,
            singleWeight,
            totalWeight,
            totalPrice
        };
    }

    function makeQuoteMessage(payload) {
        const lines = [
            'Merhaba, sac levha ağırlık hesabıma göre teklif almak istiyorum.',
            `Malzeme: ${payload.material}`,
            `Ölçüler: ${payload.lengthMm} x ${payload.widthMm} x ${payload.thicknessMm} mm`,
            `Adet: ${payload.quantity}`,
            `Yoğunluk: ${payload.density} g/cm3`,
            `Tek parça: ${formatKg(payload.singleWeight)} kg`,
            `Toplam: ${formatKg(payload.totalWeight)} kg`
        ];

        if (payload.pricePerKg > 0) {
            lines.push(`Birim fiyat: ${formatMoney(payload.pricePerKg)} / kg`);
            lines.push(`Yaklaşık toplam: ${formatMoney(payload.totalPrice)}`);
        }

        return lines.join('\n');
    }

    function updateWhatsappLinks(message) {
        const encoded = encodeMessage(message || 'Merhaba, fiber lazer kesim hizmetiniz için teklif almak istiyorum.');
        qsa('[data-whatsapp]').forEach(link => {
            link.href = `https://wa.me/${whatsappNumber}?text=${encoded}`;
        });
    }

    function showCalculatorError(message) {
        const error = document.getElementById('calculatorError');
        if (!error) return;
        error.textContent = message;
        error.hidden = false;
    }

    function clearCalculatorError() {
        const error = document.getElementById('calculatorError');
        if (!error) return;
        error.textContent = '';
        error.hidden = true;
    }

    function renderCalculator() {
        if (!document.getElementById('sheetCalculator')) return null;

        try {
            clearCalculatorError();
            const payload = getCalculatorPayload();
            document.getElementById('singleWeightResult').textContent = `${formatKg(payload.singleWeight)} kg`;
            document.getElementById('totalWeightResult').textContent = `${formatKg(payload.totalWeight)} kg`;
            document.getElementById('totalPriceResult').textContent = payload.pricePerKg > 0 ? formatMoney(payload.totalPrice) : 'Fiyat girilmedi';
            document.getElementById('resultNote').textContent = makeQuoteMessage(payload);
            updateWhatsappLinks(makeQuoteMessage(payload));
            return payload;
        } catch (error) {
            showCalculatorError(error.message || 'Hesaplama için tüm değerleri doğru girin.');
            return null;
        }
    }

    function initCalculator() {
        const calculator = document.getElementById('sheetCalculator');
        if (!calculator) return;

        const material = document.getElementById('material');
        Object.entries(weightApi.MATERIALS).forEach(([key, item]) => {
            const option = document.createElement('option');
            option.value = key;
            option.textContent = item.label;
            material.appendChild(option);
        });

        function syncDensity() {
            const selected = weightApi.MATERIALS[material.value];
            if (selected) {
                document.getElementById('density').value = selected.density;
            }
            renderCalculator();
        }

        material.addEventListener('change', syncDensity);
        qsa('#sheetCalculator input').forEach(input => input.addEventListener('input', renderCalculator));
        const calculatorEnterFields = qsa('#sheetCalculator input, #sheetCalculator select');
        calculatorEnterFields.forEach((field, index) => {
            field.addEventListener('keydown', event => {
                if (event.key !== 'Enter') return;
                event.preventDefault();
                const nextField = calculatorEnterFields[index + 1];
                if (nextField) {
                    nextField.focus();
                    return;
                }
                calculator.querySelector('button[type="submit"]')?.focus();
            });
        });
        calculator.addEventListener('submit', event => {
            event.preventDefault();
            renderCalculator();
        });

        document.getElementById('clearCalculator').addEventListener('click', () => {
            calculator.reset();
            material.value = 'steel';
            syncDensity();
            document.getElementById('pricePerKg').value = '';
            renderCalculator();
        });

        document.getElementById('sendCalculatorQuote').addEventListener('click', () => {
            const payload = renderCalculator();
            if (!payload) return;
            localStorage.setItem(quoteStorageKey, JSON.stringify(payload));
            window.location.href = `https://wa.me/${whatsappNumber}?text=${encodeMessage(makeQuoteMessage(payload))}`;
        });

        material.value = 'steel';
        syncDensity();
    }

    function initContactForm() {
        const form = document.getElementById('quoteForm');
        if (!form) return;

        const stored = localStorage.getItem(quoteStorageKey);
        if (stored) {
            try {
                const payload = JSON.parse(stored);
                const description = document.getElementById('description');
                document.getElementById('service').value = 'Fiber Lazer Kesim';
                document.getElementById('materialType').value = payload.material || '';
                document.getElementById('thickness').value = payload.thicknessMm || '';
                document.getElementById('count').value = payload.quantity || '';
                description.value = `${makeQuoteMessage(payload)}\n\nDXF/DWG veya teknik resim dosyamı ekleyerek detaylı teklif almak istiyorum.`;
                updateWhatsappLinks(description.value);
            } catch (error) {
                localStorage.removeItem(quoteStorageKey);
            }
        }

        const enterFlowFields = qsa('#quoteForm input:not([type="file"]), #quoteForm select, #quoteForm textarea');
        enterFlowFields.forEach((field, index) => {
            field.addEventListener('keydown', event => {
                if (event.key !== 'Enter' || event.shiftKey) return;
                event.preventDefault();
                const nextField = enterFlowFields[index + 1];
                if (nextField) {
                    nextField.focus();
                    return;
                }
                form.querySelector('button[type="submit"]')?.focus();
            });
        });

        form.addEventListener('submit', event => {
            event.preventDefault();
            const data = new FormData(form);
            const requiredFields = ['name', 'phone', 'service', 'description'];
            const missing = requiredFields.filter(field => !String(data.get(field) || '').trim());
            const status = document.getElementById('formStatus');

            if (missing.length) {
                status.textContent = 'Lütfen zorunlu alanları doldurun: ad soyad, telefon, hizmet seçimi ve açıklama.';
                status.className = 'form-status error';
                return;
            }

            const message = [
                'Yeni teklif talebi',
                `Ad Soyad: ${data.get('name')}`,
                `Firma: ${data.get('company') || '-'}`,
                `Telefon: ${data.get('phone')}`,
                `E-posta: ${data.get('email') || '-'}`,
                `Hizmet: ${data.get('service')}`,
                `Malzeme: ${data.get('materialType') || '-'}`,
                `Kalınlık: ${data.get('thickness') || '-'}`,
                `Adet: ${data.get('count') || '-'}`,
                `Açıklama: ${data.get('description')}`
            ].join('\n');

            console.log('Teklif formu:', Object.fromEntries(data.entries()));
            updateWhatsappLinks(message);
            status.textContent = 'Talep hazırlandı. WhatsApp hızlı iletişim butonu bu bilgilerle güncellendi.';
            status.className = 'form-status success';
        });
    }

    function initNavigation() {
        const toggle = qs('.nav-toggle');
        const nav = qs('.site-nav');
        const menu = qs('.menu-panel');
        if (!toggle) return;

        toggle.addEventListener('click', () => {
            const target = menu || nav;
            if (!target) return;
            const isOpen = target.classList.toggle('is-open');
            if (menu) menu.hidden = !isOpen;
            toggle.setAttribute('aria-expanded', String(isOpen));
        });

        if (menu) {
            menu.addEventListener('click', event => {
                if (!event.target.closest('a')) return;
                menu.classList.remove('is-open');
                menu.hidden = true;
                toggle.setAttribute('aria-expanded', 'false');
            });
        }
    }

    function initServicesDropdown() {
        const serviceLinks = [
            ['Fiber Lazer', 'fiber-lazer-kesim.html'],
            ['Sac Büküm', 'sac-bukum.html'],
            ['Kaynak', 'kaynak.html'],
            ['Toz Boya', 'toz-boya.html'],
            ['Endüstriyel Boya', 'endustriyel-boya.html']
        ];
        const targets = qsa('.site-header .site-nav a, .site-header .quick-nav a')
            .filter(link => link.textContent.trim().toLocaleLowerCase('tr-TR') === 'hizmetlerimiz');

        targets.forEach(link => {
            if (link.closest('.services-dropdown')) return;

            const wrapper = document.createElement('div');
            wrapper.className = 'services-dropdown';

            const button = document.createElement('button');
            button.className = 'services-dropdown-toggle';
            button.type = 'button';
            button.textContent = link.textContent.trim();
            button.setAttribute('aria-expanded', 'false');

            const panel = document.createElement('div');
            panel.className = 'services-dropdown-menu';
            panel.setAttribute('aria-label', 'Hizmetlerimiz');
            panel.innerHTML = serviceLinks
                .map(([label, href]) => `<a href="${href}">${label}</a>`)
                .join('');

            link.replaceWith(wrapper);
            wrapper.append(button, panel);

            button.addEventListener('click', event => {
                event.stopPropagation();
                qsa('.services-dropdown.is-open').forEach(openDropdown => {
                    if (openDropdown === wrapper) return;
                    openDropdown.classList.remove('is-open');
                    openDropdown.querySelector('.services-dropdown-toggle')?.setAttribute('aria-expanded', 'false');
                });
                const isOpen = wrapper.classList.toggle('is-open');
                button.setAttribute('aria-expanded', String(isOpen));
            });
        });

        document.addEventListener('click', event => {
            if (event.target.closest('.services-dropdown')) return;
            qsa('.services-dropdown.is-open').forEach(dropdown => {
                dropdown.classList.remove('is-open');
                dropdown.querySelector('.services-dropdown-toggle')?.setAttribute('aria-expanded', 'false');
            });
        });

        document.addEventListener('keydown', event => {
            if (event.key !== 'Escape') return;
            qsa('.services-dropdown.is-open').forEach(dropdown => {
                dropdown.classList.remove('is-open');
                dropdown.querySelector('.services-dropdown-toggle')?.setAttribute('aria-expanded', 'false');
            });
        });
    }

    function initPersistentHeroVideo() {
        const videos = qsa('.laser-effect-video');
        if (!videos.length) return;

        let lastSavedAt = 0;
        const savedTime = Number(localStorage.getItem(heroVideoTimeKey) || 0);

        videos.forEach(video => {
            video.addEventListener('loadedmetadata', () => {
                if (!Number.isFinite(savedTime) || savedTime <= 0 || !Number.isFinite(video.duration) || video.duration <= 0) return;
                video.currentTime = savedTime % video.duration;
            }, { once: true });

            video.addEventListener('timeupdate', () => {
                const now = Date.now();
                if (now - lastSavedAt < 500 || !Number.isFinite(video.currentTime)) return;
                lastSavedAt = now;
                localStorage.setItem(heroVideoTimeKey, String(video.currentTime));
            });

            video.play?.().catch(() => {});
        });

        window.addEventListener('pagehide', () => {
            const activeVideo = videos.find(video => !video.paused) || videos[0];
            if (activeVideo && Number.isFinite(activeVideo.currentTime)) {
                localStorage.setItem(heroVideoTimeKey, String(activeVideo.currentTime));
            }
        });
    }

    function initMachineStory() {
        const story = qs('[data-machine-story]');
        if (!story) return;

        const steps = qsa('[data-story-step]');
        const controls = qsa('[data-story-control]');
        const metric = qs('[data-story-metric]');
        const metricLabel = qs('[data-story-label]');
        const metrics = [
            ['GWEIKE', 'fiber lazer hattı'],
            ['6 kW', 'Raycus güç'],
            ['BM06K', 'Raytools kesim kafası'],
            ['CypCut', 'Pro kontrol yazılımı']
        ];

        if (!steps.length) return;

        let activeIndex = -1;
        let ticking = false;

        function clamp(value, min, max) {
            return Math.min(Math.max(value, min), max);
        }

        function setActive(index) {
            const nextIndex = clamp(index, 0, steps.length - 1);
            if (nextIndex === activeIndex) return;
            activeIndex = nextIndex;

            steps.forEach((step, stepIndex) => {
                const isActive = stepIndex === nextIndex;
                step.classList.toggle('is-active', isActive);
                step.setAttribute('aria-hidden', String(!isActive));
            });

            controls.forEach(control => {
                const isActive = Number(control.dataset.storyControl) === nextIndex;
                control.classList.toggle('is-active', isActive);
                if (isActive) {
                    control.setAttribute('aria-current', 'true');
                } else {
                    control.removeAttribute('aria-current');
                }
            });

            if (metric && metrics[nextIndex]) metric.textContent = metrics[nextIndex][0];
            if (metricLabel && metrics[nextIndex]) metricLabel.textContent = metrics[nextIndex][1];
        }

        function updateStory() {
            ticking = false;
            const rect = story.getBoundingClientRect();
            const scrollable = Math.max(rect.height - window.innerHeight, 1);
            const progress = clamp((-rect.top + window.innerHeight * 0.12) / scrollable, 0, 1);
            const index = Math.min(steps.length - 1, Math.floor(progress * steps.length));

            story.style.setProperty('--story-progress', progress.toFixed(3));
            setActive(index);
        }

        function requestUpdate() {
            if (ticking) return;
            ticking = true;
            requestAnimationFrame(updateStory);
        }

        controls.forEach(control => {
            control.addEventListener('click', () => {
                const index = Number(control.dataset.storyControl) || 0;
                const scrollable = Math.max(story.offsetHeight - window.innerHeight, 0);
                const targetTop = story.offsetTop + scrollable * (index / Math.max(steps.length - 1, 1));
                window.scrollTo({ top: targetTop, behavior: 'smooth' });
            });
        });

        window.addEventListener('scroll', requestUpdate, { passive: true });
        window.addEventListener('resize', requestUpdate);
        updateStory();
    }

    function initAkAiPanel() {
        ensureAkAiElements();

        const trigger = qs('.hero-video-logo');
        const panel = qs('#akAiPanel');
        if (!trigger || !panel) return;

        const closeButton = panel.querySelector('.ak-ai-close');
        const input = panel.querySelector('#akAiInput');
        const whatsapp = panel.querySelector('#akAiWhatsapp');
        const reset = panel.querySelector('.ak-ai-reset');

        function syncWhatsapp() {
            if (!whatsapp) return;
            const text = input?.value?.trim()
                ? `Merhaba, AK AI ile projemi değerlendirmek istiyorum.\n\n${input.value.trim()}`
                : 'Merhaba, AK AI ile projem için teklif almak istiyorum.';
            whatsapp.href = `https://wa.me/${whatsappNumber}?text=${encodeMessage(text)}`;
        }

        function openPanel() {
            panel.hidden = false;
            requestAnimationFrame(() => panel.classList.add('is-open'));
            trigger.setAttribute('aria-expanded', 'true');
            syncWhatsapp();
            input?.focus();
        }

        function closePanel() {
            panel.classList.remove('is-open');
            trigger.setAttribute('aria-expanded', 'false');
            setTimeout(() => {
                if (!panel.classList.contains('is-open')) panel.hidden = true;
            }, 220);
        }

        trigger.addEventListener('click', openPanel);
        closeButton?.addEventListener('click', closePanel);
        panel.addEventListener('click', event => {
            if (event.target === panel) closePanel();
        });
        document.addEventListener('keydown', event => {
            if (event.key === 'Escape' && !panel.hidden) closePanel();
        });
        input?.addEventListener('input', syncWhatsapp);
        reset?.addEventListener('click', () => {
            if (input) input.value = '';
            syncWhatsapp();
            input?.focus();
        });
        qsa('[data-ai-prompt]').forEach(button => {
            button.addEventListener('click', () => {
                if (input) input.value = button.dataset.aiPrompt || '';
                syncWhatsapp();
                input?.focus();
            });
        });
    }

    function ensureAkAiElements() {
        if (!qs('.hero-video-logo')) {
            const trigger = document.createElement('button');
            trigger.className = 'hero-video-logo page-ai-logo';
            trigger.type = 'button';
            trigger.setAttribute('aria-label', 'AK AI panelini aç');
            trigger.setAttribute('aria-expanded', 'false');
            trigger.setAttribute('aria-controls', 'akAiPanel');
            trigger.innerHTML = '<img src="../assets/ak-lazer-icon-ui.png" alt="">';
            document.body.appendChild(trigger);
        }

        if (!qs('#akAiPanel')) {
            const panel = document.createElement('section');
            panel.className = 'ak-ai-panel';
            panel.id = 'akAiPanel';
            panel.hidden = true;
            panel.innerHTML = `
                <div class="ak-ai-dialog" role="dialog" aria-modal="true" aria-labelledby="akAiTitle">
                    <button class="ak-ai-close" type="button" aria-label="AK AI panelini kapat"><i class="fa-solid fa-xmark"></i></button>
                    <span class="eyebrow">Akıllı teklif asistanı</span>
                    <h2 id="akAiTitle">AK AI</h2>
                    <p>Projenizin malzeme, kalınlık, ölçü ve adet bilgisini yazın; teklif için paylaşılacak mesajı hızlıca hazırlayın.</p>
                    <div class="ak-ai-prompts">
                        <button type="button" data-ai-prompt="2 mm DKP sac, 40 adet lazer kesim ve büküm için teklif istiyorum.">Lazer + büküm</button>
                        <button type="button" data-ai-prompt="Paslanmaz parça için lazer kesim, kaynak ve boya sürecini değerlendirmek istiyorum.">Kesim + kaynak</button>
                        <button type="button" data-ai-prompt="DXF dosyam var, üretilebilirlik ve yaklaşık teslim süresi için bilgi almak istiyorum.">Dosya kontrolü</button>
                    </div>
                    <textarea id="akAiInput" placeholder="Örn: 3 mm siyah sac, 120 adet, lazer kesim ve büküm ihtiyacı var."></textarea>
                    <div class="action-row">
                        <a class="btn btn-primary laser-quote-btn whatsapp-send-btn" id="akAiWhatsapp" href="https://wa.me/905375883195?text=Merhaba%2C%20AK%20AI%20ile%20projem%20i%C3%A7in%20teklif%20almak%20istiyorum." target="_blank" rel="noopener">WhatsApp'a Gönder</a>
                        <button class="btn btn-ghost ak-ai-reset" type="button">Temizle</button>
                    </div>
                </div>
            `;
            document.body.insertBefore(panel, qs('.footer') || null);
        }
    }

    document.addEventListener('DOMContentLoaded', () => {
        initNavigation();
        initServicesDropdown();
        initCalculator();
        initContactForm();
        initPersistentHeroVideo();
        initMachineStory();
        initAkAiPanel();
        updateWhatsappLinks();
    });
})();
