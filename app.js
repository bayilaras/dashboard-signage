// ============================================
// DASHBOARD DIGITAL SIGNAGE - APP.JS (Tailwind Redesign)
// ============================================

// Global state
const state = {
    meetings: [],
    currentMeetings: [], // Filtered meetings (ongoing/upcoming)
    isLoading: false,
    error: null,
    refreshTimer: null,
    clockTimer: null,
    // Pagination State
    pagination: {
        currentPage: 0,
        totalPages: 0,
        timer: null
    },
    // Slideshow State (for Idle Mode)
    slideshow: {
        slides: [],
        currentIndex: 0,
        timer: null,
        interval: 8000 // 8 seconds per slide
    }
};

// ============================================
// AUTO-RETRY MANAGER
// ============================================
class AutoRetryManager {
    constructor() {
        this.retryCount = 0;
        this.baseDelay = 10000; // Start with 10s
        this.maxDelay = 60000;  // Max 60s
        this.timer = null;
        this.isRetrying = false;
    }

    startRetry(callback) {
        if (this.isRetrying) return;
        this.isRetrying = true;

        // Exponential Backoff: 10s -> 15s -> 22s -> ... -> 60s
        const delay = Math.min(this.baseDelay * Math.pow(1.5, this.retryCount), this.maxDelay);

        // Update UI countdown
        this.updateRetryUI(delay, callback);

        console.log(`[AutoRetry] Retrying in ${delay / 1000}s (Attempt ${this.retryCount + 1})`);
    }

    updateRetryUI(delay, callback) {
        // Show Error State which contains the countdown
        showState('error');

        const progressBar = document.getElementById('retryProgressBar');
        const countdownText = document.getElementById('retryCountdown');

        if (progressBar) {
            // Reset animation
            progressBar.style.transition = 'none';
            progressBar.style.width = '100%';
            void progressBar.offsetWidth; // Force reflow

            // Start animation
            progressBar.style.transition = `width ${delay}ms linear`;
            progressBar.style.width = '0%';
        }

        let secondsLeft = Math.ceil(delay / 1000);
        if (countdownText) countdownText.textContent = secondsLeft;

        const interval = setInterval(() => {
            secondsLeft--;
            if (countdownText) countdownText.textContent = secondsLeft > 0 ? secondsLeft : 0;

            if (secondsLeft <= 0) {
                clearInterval(interval);
                this.executeRetry(callback);
            }
        }, 1000);

        this.timer = interval;
    }

    executeRetry(callback) {
        this.isRetrying = false;
        this.retryCount++;
        callback();
    }

    reset() {
        if (this.timer) clearInterval(this.timer);
        this.retryCount = 0;
        this.isRetrying = false;
        this.timer = null;
    }
}

const retryManager = new AutoRetryManager();

// ============================================
// INITIALIZATION
// ============================================

document.addEventListener('DOMContentLoaded', async () => {
    console.log('Dashboard Initialized (Tailwind Redesign)');

    startClock();

    // Initial fetch
    fetchMeetingData();

    // Setup auto-refresh (every 2 minutes)
    startAutoRefresh();

    // Setup network monitoring
    setupConnectionMonitoring();

    // Daily reload to clear memory
    setupAutoReload();
});

// ============================================
// UI STATE MANAGEMENT
// ============================================

function showState(stateName) {
    const states = {
        loading: document.getElementById('loadingState'),
        error: document.getElementById('errorState'),
        empty: document.getElementById('emptyState'),
        content: document.getElementById('meetingContainer')
    };

    const pag = document.getElementById('paginationControls');
    const badge = document.getElementById('statusBadge');

    // Default: Hide all
    Object.values(states).forEach(el => el?.classList.add('hidden'));

    // Show requested
    if (states[stateName]) {
        states[stateName].classList.remove('hidden');
    }

    // Context-specific visibility
    if (stateName === 'content') {
        pag?.classList.remove('opacity-0');
        badge?.classList.remove('hidden');
    } else {
        pag?.classList.add('opacity-0');
        // Keep badge visible only if we have stale data? No, hide it for clean error/empty states
        badge?.classList.add('hidden');
    }
}

// ============================================
// CLOCK
// ============================================

function startClock() {
    updateClock();
    setInterval(updateClock, 1000);
}

function updateClock() {
    const now = new Date();

    // Time: 10:45
    const timeStr = now.toLocaleTimeString('id-ID', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    });

    // Date: Monday, 24 October 2023
    const dateStr = now.toLocaleDateString('id-ID', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric'
    });

    const timeEl = document.getElementById('currentTime');
    const dateEl = document.getElementById('currentDate');

    if (timeEl) timeEl.textContent = timeStr;
    if (dateEl) dateEl.textContent = dateStr;
}

// ============================================
// DATA FETCHING
// ============================================

async function fetchMeetingData() {
    // Only show full loading spinner if we have NO data yet (first load)
    if (state.meetings.length === 0 && !state.error) {
        showState('loading');
    }

    try {
        const dataUrl = CONFIG.getDataUrl();
        const response = await fetch(dataUrl);

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const jsonData = await response.json();

        if (jsonData.error) throw new Error(jsonData.error);

        // Process Data
        let meetings = [];
        if (jsonData.meetings && Array.isArray(jsonData.meetings)) {
            // MAP and RECALCULATE status client-side to ensure accuracy with client clock
            meetings = jsonData.meetings.map(m => {
                const clientStatus = calculateClientSideStatus(m.jamMulai, m.jamSelesai);
                return {
                    ...m,
                    status: clientStatus, // Override backend status
                    originalStatus: m.status // Keep original for debug
                };
            });
        }

        // Success
        retryManager.reset();
        state.meetings = meetings;
        state.error = null;

        renderApp(meetings);

    } catch (error) {
        console.error('Fetch Error:', error);
        state.error = error.message;

        const errorMsgEl = document.getElementById('errorMessage');
        if (errorMsgEl) errorMsgEl.textContent = `Error: ${error.message}`;

        // If we have stale data, maybe keep showing it? 
        // User requirement: "Auto-Retry Countdown Overlay" implies showing error screen.
        // We will show error screen to be safe and informative.
        retryManager.startRetry(fetchMeetingData);
    }
}

// ============================================
// RENDERING
// ============================================

function renderApp(meetings) {
    if (meetings.length === 0) {
        showState('empty');
        startSlideshow(); // Start slideshow when idle
        return;
    }

    stopSlideshow(); // Stop slideshow when meetings exist
    showState('content');

    // Sort logic handled by backend usually, but we can ensure here if needed
    // Assuming backend returns filtered "ongoing" and "upcoming"

    setupPagination(meetings);

    // Update live badge logic (if at least one ongoing meeting)
    const hasOngoing = meetings.some(m => (m.status || '').toLowerCase() === 'ongoing');
    updateStatusBadge(hasOngoing);
}

function updateStatusBadge(isLive) {
    const badge = document.getElementById('statusBadge');
    if (!badge) return;

    const textEl = badge.querySelector('.status-text');
    const pingEl = badge.querySelector('.animate-ping');
    const dotEl = badge.querySelector('.relative.inline-flex'); // The solid dot

    if (isLive) {
        // Live/Ongoing style
        textEl.textContent = 'LIVE';
        textEl.classList.remove('text-yellow-500');
        textEl.classList.add('text-[#137fec]'); // Or Green? Design says Blue/Green

        pingEl.classList.remove('hidden');
        dotEl.classList.remove('bg-yellow-500');
        dotEl.classList.add('bg-green-500');
    } else {
        // Upcoming Only style
        textEl.textContent = 'UPCOMING';
        textEl.classList.remove('text-[#137fec]');
        textEl.classList.add('text-yellow-500');

        pingEl.classList.add('hidden'); // No ping for upcoming
        dotEl.classList.remove('bg-green-500');
        dotEl.classList.add('bg-yellow-500');
    }
}

// ============================================
// PAGINATION
// ============================================

function setupPagination(meetings) {
    // Clear existing timer
    if (state.pagination.timer) {
        clearInterval(state.pagination.timer);
        state.pagination.timer = null;
    }

    // Determine items per page based on screen width? 
    // For MVP, config.js has a value, but with Responsive Grid, 
    // the UI adapts "visually". We need to decide how many CARDS per page.
    // Logic: 
    // Grid handles 2 (landscape) or 3 (wide) or 1 (mobile).
    // Let's stick to CONFIG or default to 4 to fill a 2x2 grid in landscape?
    const itemsPerPage = CONFIG.display.pagination?.itemsPerPage || 4;

    state.pagination.currentPage = 0;
    state.pagination.totalPages = Math.ceil(meetings.length / itemsPerPage);
    state.currentMeetings = meetings;

    // Render Page 0
    renderMeetingPage();

    // Start rotation if needed
    if (state.pagination.totalPages > 1) {
        renderPaginationDots();
        startPaginationTimer();
    } else {
        // Clear dots if single page
        const container = document.getElementById('paginationControls');
        if (container) container.innerHTML = '';

        // Even for single page, we might want to rotate to Showcase? 
        // For simplicity, let's keep it simple: Showcase only triggers if pagination is active OR we can force it timer.
        // Let's enable showcase even if single page if config says so.
        if (CONFIG.roomShowcase?.enabled) {
            startPaginationTimer(); // Will trigger next page -> check logic
        }
    }
}

function startPaginationTimer() {
    if (state.pagination.timer) clearInterval(state.pagination.timer);

    const interval = CONFIG.display.pagination?.interval || 10000;
    state.pagination.timer = setInterval(() => {
        nextPage();
    }, interval);
}

function nextPage() {
    // Check if we entered Showcase Mode
    // Logic: If we are at the last page, and about to go to 0, show Showcase first.
    const isLastPage = state.pagination.currentPage === state.pagination.totalPages - 1;

    // Special handling for Single Page: always show showcase after interval if enabled
    const isSinglePage = state.pagination.totalPages <= 1;

    if ((isLastPage || isSinglePage) && CONFIG.roomShowcase?.enabled && state.currentMeetings.length > 0) {
        showRoomShowcase();
        return;
    }

    state.pagination.currentPage = (state.pagination.currentPage + 1) % state.pagination.totalPages;
    renderMeetingPage();
    renderPaginationDots();
}

// Room Showcase State
let showcaseIndex = 0;

function showRoomShowcase() {
    // 1. Pause Pagination
    if (state.pagination.timer) clearInterval(state.pagination.timer);

    // 2. Hide Grid
    const gridContainer = document.getElementById('meetingsContainer'); // Careful! ID check
    // Actually the grid is embedded in content state. We can just overlay the Showcase Div.

    const showcaseContainer = document.getElementById('showcaseContainer');
    if (!showcaseContainer) return;

    // 3. Prepare Content
    const rooms = CONFIG.roomShowcase.rooms;
    const room = rooms[showcaseIndex];

    // Update Elements
    document.getElementById('showcaseImage').src = room.image;
    document.getElementById('showcaseRoomName').textContent = room.name;
    document.getElementById('showcaseCapacity').textContent = room.capacity || 'Fasilitas Rapat';

    // 4. Show Showcase
    showcaseContainer.classList.remove('hidden');

    // Cycle index for next time
    showcaseIndex = (showcaseIndex + 1) % rooms.length;

    // 5. Set Timer to Resume
    setTimeout(() => {
        // Hide Showcase
        showcaseContainer.classList.add('hidden');

        // Go to Page 0
        state.pagination.currentPage = 0;
        renderMeetingPage();
        renderPaginationDots();

        // Resume Timer
        startPaginationTimer();

    }, CONFIG.roomShowcase.interval || 8000);
}


function renderMeetingPage() {
    const container = document.getElementById('meetingContainer');
    if (!container) return;

    const itemsPerPage = CONFIG.display.pagination?.itemsPerPage || 4;
    const start = state.pagination.currentPage * itemsPerPage;
    const end = start + itemsPerPage;
    const pageData = state.currentMeetings.slice(start, end);

    // Fade Out
    container.style.opacity = '0';
    container.style.transform = 'translateY(10px)';
    container.style.transition = 'all 0.3s ease-out';

    setTimeout(() => {
        container.innerHTML = '';
        pageData.forEach(meeting => {
            container.appendChild(createMeetingCard(meeting));
        });

        // Fade In
        container.style.opacity = '1';
        container.style.transform = 'translateY(0)';
    }, 300);
}

function renderPaginationDots() {
    const container = document.getElementById('paginationControls');
    if (!container) return;

    container.innerHTML = '';
    for (let i = 0; i < state.pagination.totalPages; i++) {
        const isActive = i === state.pagination.currentPage;

        const dot = document.createElement('div');
        // Tailwind classes for dots
        dot.className = isActive
            ? 'h-2 w-8 bg-[#137fec] rounded-full transition-all duration-300'
            : 'h-2 w-2 bg-white/20 rounded-full transition-all duration-300';

        container.appendChild(dot);
    }
}

function createMeetingCard(meeting) {
    const status = (meeting.status || '').toLowerCase(); // ongoing, upcoming
    const isOngoing = status === 'ongoing';

    // Color Logic
    const accentColor = isOngoing ? 'text-green-400' : 'text-amber-400';
    const borderColor = isOngoing ? 'border-green-500' : 'border-amber-500/50';
    const bgPulse = isOngoing ? 'bg-green-500/10' : 'bg-transparent';
    const cardOpacity = isOngoing ? 'opacity-100' : 'opacity-80';

    // Status Badge inside card
    const statusLabel = isOngoing ? 'SEDANG BERLANGSUNG' : 'AKAN DATANG';
    const statusBadgeClass = isOngoing
        ? 'bg-green-500/20 text-green-400 border-green-500/30'
        : 'bg-amber-500/10 text-amber-400 border-amber-500/20';

    const card = document.createElement('div');
    // Using group for hover effects, relative for positioning
    // h-auto min-h-[180px] to ensure consistency
    card.className = `group relative flex flex-col p-6 rounded-2xl border ${borderColor} bg-[#1a232e] ${bgPulse} ${cardOpacity} shadow-2xl overflow-hidden transition-all duration-300 hover:scale-[1.02]`;

    // HTML Content
    card.innerHTML = `
        <!-- Glow Effect for Ongoing -->
        ${isOngoing ? '<div class="absolute -top-10 -right-10 w-32 h-32 bg-green-500/20 blur-3xl rounded-full pointer-events-none"></div>' : ''}
        
        <!-- Top Row: Time & Status -->
        <div class="flex justify-between items-start mb-4 z-10">
            <div class="flex flex-col">
                <div class="flex items-baseline gap-2 flex-wrap">
                    <span class="text-3xl font-black text-white tracking-tight">${meeting.jamMulai}</span>
                    <span class="text-white/40 text-xl font-normal">s.d ${meeting.jamSelesai} WIB</span>
                </div>
            </div>
            <span class="px-3 py-1 rounded-lg border text-xs font-bold tracking-widest ${statusBadgeClass} flex items-center gap-1">
                ${isOngoing ? '<span class="relative flex h-2 w-2 mr-1"><span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span><span class="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span></span>' : ''}
                ${statusLabel}
            </span>
        </div>

        <!-- Middle: Agenda -->
        <h3 class="text-xl md:text-2xl font-bold text-white leading-snug mb-4 line-clamp-3 group-hover:line-clamp-none transition-all">
            ${meeting.keperluan || 'Agenda Rapat'}
        </h3>

        <!-- Bottom: Room & Unit -->
        <!-- Bottom: Room & Unit -->
        <div class="mt-auto pt-4 border-t border-white/5 flex flex-col gap-2">
            <!-- Room & Wayfinding -->
            <div class="flex items-start justify-between gap-2">
                <div class="flex flex-col overflow-hidden">
                    <div class="flex items-center gap-2 text-[#92adc9]">
                        <span class="material-symbols-outlined text-[20px]">meeting_room</span>
                        <span class="font-semibold text-white/90 truncate">${meeting.ruangan || 'Ruang Rapat'}</span>
                    </div>
                    
                    <!-- Wayfinding Detail Text -->
                    ${(() => {
            const wf = getWayfindingConfig(meeting.ruangan);
            return wf ? `<span class="text-xs text-white/50 ml-7 truncate">${wf.detail}</span>` : '';
        })()}
                </div>

                <!-- Wayfinding Badge (Arrow) -->
                ${(() => {
            const wf = getWayfindingConfig(meeting.ruangan);
            if (!wf) return '';
            return `
                    <div class="flex items-center gap-1 px-2 py-1 rounded bg-white/5 border border-white/10 shrink-0">
                        <span class="text-xs font-bold ${wf.color} uppercase">${wf.label}</span>
                        <span class="material-symbols-outlined ${wf.color} text-lg">${wf.icon}</span>
                    </div>`;
        })()}
            </div>

            <!-- Unit/Satker -->
            ${meeting.unit ? `
            <div class="flex items-center gap-2 text-[#92adc9]/70 text-sm">
                <span class="material-symbols-outlined text-[18px]">domain</span>
                <span class="truncate">${meeting.unit}</span>
            </div>
            ` : ''}
        </div>
    `;

    return card;
}

// Helper for Fuzzy Matching Room Names
function getWayfindingConfig(roomName) {
    if (!roomName || !CONFIG.wayfinding) return null;

    // Try Exact Match
    if (CONFIG.wayfinding[roomName]) return CONFIG.wayfinding[roomName];

    // Try Fuzzy Match
    const keys = Object.keys(CONFIG.wayfinding);
    for (const key of keys) {
        if (roomName.toLowerCase().includes(key.toLowerCase())) {
            return CONFIG.wayfinding[key];
        }
    }

    // Keyword Match
    if (roomName.toUpperCase().includes('L2A')) return CONFIG.wayfinding['Ruang Rapat L2A'];
    if (roomName.toUpperCase().includes('L2B')) return CONFIG.wayfinding['Ruang Rapat L2B'];
    if (roomName.toUpperCase().includes('L2C')) return CONFIG.wayfinding['Ruang Rapat L2C'];

    return null;
}

// ============================================
// HELPERS
// ============================================

function startAutoRefresh() {
    if (state.refreshTimer) clearInterval(state.refreshTimer);
    state.refreshTimer = setInterval(fetchMeetingData, CONFIG.refresh.interval);
}

function setupConnectionMonitoring() {
    window.addEventListener('online', () => {
        console.log('Online detected');
        // Optionally auto-retry immediately
        // retryManager.reset(); 
        // fetchMeetingData(); 
        // User might prefer the countdown to finish naturally or click "Coba Sekarang"
    });
    window.addEventListener('offline', () => {
        console.log('Offline detected');
    });
}

function setupAutoReload() {
    // Reload at 3 AM or simply after 24h
    setTimeout(() => window.location.reload(), 24 * 60 * 60 * 1000);
}

function calculateClientSideStatus(startTimeStr, endTimeStr) {
    if (!startTimeStr || !endTimeStr) return 'upcoming'; // Fallback

    const now = new Date();
    const [startH, startM] = startTimeStr.split(':').map(Number);
    const [endH, endM] = endTimeStr.split(':').map(Number);

    const startDate = new Date(now);
    startDate.setHours(startH, startM, 0, 0);

    const endDate = new Date(now);
    endDate.setHours(endH, endM, 0, 0);

    // Handle case where end time is e.g. 00:30 (next day) ?? 
    // MVP assumption: Meetings are within the same day as filtered by backend.
    // But specific fix for "23:01" issue:
    // If start is 13:00 and end is 23:20, and now is 23:01.
    // startDate < now < endDate.

    if (now >= startDate && now <= endDate) {
        return 'ongoing';
    } else if (now < startDate) {
        return 'upcoming';
    } else {
        return 'finished';
    }
}

// ============================================
// SLIDESHOW (IDLE MODE)
// ============================================

async function loadSlides() {
    let slides = [];

    // Try 1: Fetch from Apps Script API (Google Sheet "Slides")
    try {
        // Add timestamp to prevent browser caching
        const timestamp = new Date().getTime();
        const apiUrl = `${CONFIG.appsScriptUrl}?action=slides&t=${timestamp}`;
        console.log('[Slideshow] Fetching from Apps Script:', apiUrl);

        const response = await fetch(apiUrl);
        const data = await response.json();

        if (data.success && data.slides && data.slides.length > 0) {
            slides = data.slides;
            console.log(`[Slideshow] Loaded ${slides.length} slides from Google Sheet`);
        } else {
            console.log('[Slideshow] No slides in Google Sheet, trying fallback...');
            throw new Error('No slides from API');
        }
    } catch (apiError) {
        console.log('[Slideshow] API fetch failed:', apiError.message);

        // Try 2: Fetch from local slides.json
        try {
            const response = await fetch('slides.json');
            const data = await response.json();

            if (data.slides && data.slides.length > 0) {
                slides = data.slides.filter(s => s.enabled).sort((a, b) => a.order - b.order);
                console.log(`[Slideshow] Loaded ${slides.length} slides from slides.json`);
            }
        } catch (jsonError) {
            console.log('[Slideshow] slides.json fetch failed:', jsonError.message);

            // Try 3: Use fallback from config.js
            if (CONFIG.slideshow?.fallbackSlides && CONFIG.slideshow.fallbackSlides.length > 0) {
                slides = CONFIG.slideshow.fallbackSlides
                    .filter(s => s.enabled)
                    .sort((a, b) => a.order - b.order);
                console.log(`[Slideshow] Using ${slides.length} fallback slides from config.js`);
            }
        }
    }

    // Always add QR Code slide at the end
    slides.push({
        id: 'qr-booking',
        type: 'qr',
        title: 'Ruang Rapat Tersedia',
        description: 'Silakan scan QR Code untuk melakukan pemesanan ruangan.',
        qrUrl: CONFIG.booking?.url || 'https://example.com/booking'
    });

    state.slideshow.slides = slides;
    console.log(`[Slideshow] Total slides ready: ${slides.length}`);
}


// Swiper Instance
let swiperInstance = null;

function startSlideshow() {
    if (swiperInstance) return; // Already running

    // Load slides if not loaded
    if (state.slideshow.slides.length === 0) {
        loadSlides().then(() => {
            initSwiper();
        });
    } else {
        initSwiper();
    }
}

function stopSlideshow() {
    if (swiperInstance) {
        swiperInstance.destroy(true, true);
        swiperInstance = null;
        console.log('[Slideshow] Stopped (Swiper Destroyed)');
    }
}

function initSwiper() {
    const container = document.getElementById('slideContent');
    if (!container) return;

    // Render slides first
    container.innerHTML = state.slideshow.slides.map(slide => `
        <div class="swiper-slide w-full h-full flex items-center justify-center bg-transparent">
            ${renderSlideContent(slide)}
        </div>
    `).join('');

    console.log('[Slideshow] Initializing Swiper...');

    // Initialize Swiper
    swiperInstance = new Swiper(".mySwiper", {
        spaceBetween: 30,
        effect: "fade", // or 'coverflow'
        fadeEffect: {
            crossFade: true
        },
        centeredSlides: true,
        autoplay: {
            delay: state.slideshow.interval || 8000,
            disableOnInteraction: false,
        },
        pagination: {
            el: ".swiper-pagination",
            clickable: true,
        },
        loop: true, // Infinite loop
    });
}


function renderSlideContent(slide) {
    switch (slide.type) {
        case 'welcome':
            return `
                <div class="flex flex-col items-center justify-center">
                    ${slide.logo ? `<img src="${slide.logo}" alt="Logo" class="h-24 md:h-32 mb-6 object-contain">` : ''}
                    <h2 class="text-3xl md:text-5xl font-bold text-white mb-4">${slide.title}</h2>
                    <p class="text-[#92adc9] text-xl md:text-2xl max-w-2xl mb-4">${slide.subtitle || ''}</p>
                    ${slide.tagline ? `<p class="text-[#fbbf24] text-lg md:text-xl italic">${slide.tagline}</p>` : ''}
                </div>
            `;

        case 'image':
            console.log('[Slideshow] Rendering Image w/ Layout V3 (Responsive Fit):', slide.image);
            return `
                <div class="w-full h-full flex items-center justify-center bg-black/50 p-4">
                    <img src="${slide.image}" 
                         alt="${slide.title}" 
                         class="w-full h-full object-contain max-h-[85vh] rounded-xl shadow-2xl"
                         onload="console.log('[Slideshow] Image loaded')"
                         onerror="this.src='https://via.placeholder.com/800x600?text=Gagal+Memuat+Gambar'">
                    
                    ${slide.title ? `
                    <div class="absolute bottom-8 left-0 right-0 text-center pointer-events-none">
                        <span class="inline-block bg-black/60 backdrop-blur-md text-white px-6 py-2 rounded-full text-xl md:text-2xl font-bold shadow-lg border border-white/10">
                            ${slide.title}
                        </span>
                    </div>
                    ` : ''}
                </div>
            `;

        case 'video':
            console.log('[Slideshow] Rendering Video (V6: YouTube + Iframe):', slide.image);

            // Check for YouTube
            let youtubeId = null;
            const ytMatch = slide.image.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/);
            if (ytMatch && ytMatch[1]) {
                youtubeId = ytMatch[1];
            }

            // Check for Drive
            let driveId = null;
            if (!youtubeId) {
                const driveMatch = slide.image.match(/id=([a-zA-Z0-9_-]+)/);
                if (driveMatch && driveMatch[1]) {
                    driveId = driveMatch[1];
                } else {
                    const dMatch = slide.image.match(/\/d\/([a-zA-Z0-9_-]+)/);
                    if (dMatch && dMatch[1]) driveId = dMatch[1];
                }
            }

            if (youtubeId) {
                // RENDER YOUTUBE Embed
                return `
                <div class="w-full h-full flex items-center justify-center bg-black overflow-hidden relative group">
                    <iframe src="https://www.youtube-nocookie.com/embed/${youtubeId}?autoplay=1&mute=1&controls=0&loop=1&playlist=${youtubeId}" 
                            class="w-full h-full absolute inset-0 z-10" 
                            style="border: none;"
                            allow="autoplay; encrypted-media; fullscreen" 
                            allowfullscreen>
                    </iframe>
                    ${slide.title ? `
                    <div class="absolute bottom-16 left-0 right-0 text-center pointer-events-none z-20">
                        <span class="inline-block bg-black/60 backdrop-blur-md text-white px-6 py-2 rounded-full text-xl md:text-2xl font-bold shadow-lg border border-white/10">
                            ${slide.title}
                        </span>
                    </div>` : ''}
                </div>`;
            } else if (driveId) {
                // RENDER DRIVE IFRAME (Best Effort)
                return `
                <div class="w-full h-full flex items-center justify-center bg-black overflow-hidden relative group">
                    <iframe src="https://drive.google.com/file/d/${driveId}/preview?autoplay=1&mute=1" 
                            class="w-full h-full absolute inset-0 z-10 md:scale-[1.05]" 
                            style="border: none;"
                            allow="autoplay; encrypted-media; fullscreen" 
                            allowfullscreen>
                    </iframe>
                    ${slide.title ? `
                    <div class="absolute bottom-16 left-0 right-0 text-center pointer-events-none z-20">
                        <span class="inline-block bg-black/60 backdrop-blur-md text-white px-6 py-2 rounded-full text-xl md:text-2xl font-bold shadow-lg border border-white/10">
                            ${slide.title}
                        </span>
                    </div>` : ''}
                </div>`;
            } else {
                // FALLBACK for Direct Links (Rare)
                return `
                <div class="w-full h-full flex items-center justify-center bg-black p-4">
                    <p class="text-white text-xl">Video URL tidak dikenali. Gunakan YouTube atau Google Drive.</p>
                </div>`;
            }

        case 'announcement':
            return `
                <div class="flex flex-col items-center justify-center glass-panel rounded-3xl p-8 md:p-12">
                    <div class="w-24 h-24 bg-[#137fec]/10 rounded-full flex items-center justify-center mb-6">
                        <span class="material-symbols-outlined text-[#137fec] text-5xl">${slide.icon || 'campaign'}</span>
                    </div>
                    <h2 class="text-3xl md:text-4xl font-bold text-white mb-4">${slide.title}</h2>
                    <p class="text-[#92adc9] text-xl md:text-2xl max-w-2xl">${slide.content || ''}</p>
                </div>
            `;

        case 'qr':
        default:
            const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(slide.qrUrl || 'https://example.com')}`;
            return `
                <div class="flex flex-col items-center justify-center">
                    <div class="w-32 h-32 bg-[#137fec]/10 rounded-full flex items-center justify-center mb-6 status-pulse">
                        <span class="material-symbols-outlined text-[#137fec] text-6xl">calendar_add_on</span>
                    </div>
                    <h2 class="text-3xl md:text-5xl font-bold text-white mb-4">${slide.title}</h2>
                    <p class="text-[#92adc9] text-xl md:text-2xl max-w-2xl mb-10">${slide.description}</p>
                    <div class="w-48 h-48 bg-white p-2 rounded-xl">
                        <img src="${qrApiUrl}" alt="QR Code Booking" class="w-full h-full object-contain">
                    </div>
                    <p class="mt-4 text-sm text-gray-500">Scan untuk Booking</p>
                </div>
            `;
    }
}
