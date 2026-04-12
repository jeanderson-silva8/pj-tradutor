// ========================================
// CONFIGURAÇÃO E CONSTANTES
// ========================================

const API_URL = 'https://api.mymemory.translated.net/get';
const MAX_CHARS = 5000;

let debounceTimer;
let abortController = null;

// ========================================
// ELEMENTOS DO DOM
// ========================================

const elements = {
    inputText: document.getElementById('inputText'),
    outputText: document.getElementById('outputText'),
    langFrom: document.getElementById('langFrom'),
    langTo: document.getElementById('langTo'),
    translateBtn: document.getElementById('translateBtn'),
    swapBtn: document.getElementById('swapBtn'),
    copyInputBtn: document.getElementById('copyInputBtn'),
    copyOutputBtn: document.getElementById('copyOutputBtn'),
    themeToggle: document.getElementById('themeToggle'),
    menuBtn: document.getElementById('menuBtn'),
    inputCounter: document.getElementById('inputCounter'),
    outputCounter: document.getElementById('outputCounter'),
    loadingSpinner: document.getElementById('loadingSpinner'),
    notification: document.getElementById('notification'),
    notificationIcon: document.querySelector('#notification .notification-icon'),
    phoneContainer: document.querySelector('.phone-container'),
    mainContent: document.querySelector('.main-content'),
    html: document.documentElement,
    themeIcon: document.querySelector('#themeToggle .material-symbols-outlined'),
};

// ========================================
// FUNÇÕES DE TRADUÇÃO
// ========================================

async function traduzir(texto, langFrom, langTo) {
    if (!texto.trim()) return '';

    // Cancela requisição anterior para evitar race condition
    if (abortController) {
        abortController.abort();
    }
    abortController = new AbortController();

    try {
        const textoEncoded = encodeURIComponent(texto);
        const fromLang = langFrom.split('-')[0];
        const toLang = langTo.split('-')[0];
        const url = `${API_URL}?q=${textoEncoded}&langpair=${fromLang}|${toLang}`;

        const response = await fetch(url, { signal: abortController.signal });
        if (!response.ok) throw new Error('Erro na requisição');

        const data = await response.json();
        if (data.responseStatus !== 200 && data.responseStatus !== 403) {
            throw new Error(data.responseDetails || 'Erro na tradução');
        }

        return data.responseData.translatedText;
    } catch (error) {
        if (error.name === 'AbortError') return null; // Requisição cancelada — ignora silenciosamente
        console.error('Erro ao traduzir:', error);
        showNotification('Erro ao traduzir. Tente novamente.', 'error');
        throw error;
    } finally {
        abortController = null;
    }
}

async function handleTranslation() {
    const text = elements.inputText.value.trim();
    if (!text) {
        showNotification('Digite um texto para traduzir', 'warning');
        return;
    }

    if (!checkConnection()) return;

    try {
        elements.translateBtn.disabled = true;
        elements.loadingSpinner.classList.remove('hidden');

        const translated = await traduzir(text, elements.langFrom.value, elements.langTo.value);
        if (translated === null) return; // Requisição cancelada

        elements.outputText.value = translated;
        updateCounter(elements.outputCounter, translated);

        scrollToOutput();
        showSuccessAnimation();
        showNotification('Tradução concluída!', 'success');
        saveToHistory(text, translated, elements.langFrom.value, elements.langTo.value);
    } catch (error) {
        console.error('Erro na tradução:', error);
    } finally {
        elements.translateBtn.disabled = false;
        elements.loadingSpinner.classList.add('hidden');
    }
}

function autoTranslate() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
        const text = elements.inputText.value.trim();
        if (!text) {
            elements.outputText.value = '';
            updateCounter(elements.outputCounter, '');
            return;
        }

        try {
            const translated = await traduzir(text, elements.langFrom.value, elements.langTo.value);
            if (translated === null) return; // Cancelado
            elements.outputText.value = translated;
            updateCounter(elements.outputCounter, translated);
        } catch (error) {
            // Silencioso para auto-tradução
        }
    }, 1000);
}

// ========================================
// HANDLERS DE UI
// ========================================

function swapLanguages() {
    const tempLang = elements.langFrom.value;
    const tempText = elements.inputText.value;

    elements.langFrom.value = elements.langTo.value;
    elements.langTo.value = tempLang;
    elements.inputText.value = elements.outputText.value;
    elements.outputText.value = tempText;

    updateCounter(elements.inputCounter, elements.inputText.value);
    updateCounter(elements.outputCounter, elements.outputText.value);

    if (elements.inputText.value.trim()) {
        autoTranslate();
    }

    vibrate(20);
    showNotification('Idiomas trocados', 'info');
}

async function copyToClipboard(text) {
    if (!text.trim()) {
        showNotification('Nada para copiar', 'warning');
        return;
    }

    try {
        await navigator.clipboard.writeText(text);
        showNotification('Texto copiado!', 'success');
        vibrate(30);
    } catch (error) {
        // Fallback para navegadores sem suporte à Clipboard API
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.cssText = 'position:fixed;left:-999999px;top:-999999px;';
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        showNotification('Texto copiado!', 'success');
        vibrate(30);
    }
}

function toggleTheme() {
    const isDark = elements.html.classList.toggle('dark');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
    elements.themeIcon.textContent = isDark ? 'light_mode' : 'dark_mode';
    showNotification(isDark ? 'Modo escuro ativado' : 'Modo claro ativado', 'info');
    vibrate(20);
}

function updateCounter(counterElement, text) {
    if (!counterElement) return;
    const count = text.length;
    counterElement.textContent = `${count} / ${MAX_CHARS}`;
    counterElement.style.color = count > MAX_CHARS * 0.9 ? 'var(--primary)' : 'var(--text-muted)';
}

function limitCharacters(e) {
    if (e.target.value.length > MAX_CHARS) {
        e.target.value = e.target.value.substring(0, MAX_CHARS);
        showNotification(`Texto limitado a ${MAX_CHARS} caracteres`, 'warning');
    }
}

/**
 * Exibe uma notificação com ícone e cor adequados ao tipo.
 * @param {string} message  - Texto da mensagem
 * @param {'success'|'error'|'warning'|'info'} type - Tipo da notificação
 */
function showNotification(message, type = 'success') {
    if (!elements.notification) return;

    const iconMap = {
        success: 'check_circle',
        error: 'error',
        warning: 'warning',
        info: 'info',
    };

    const textSpan = elements.notification.querySelector('.notification-text');
    if (textSpan) textSpan.textContent = message;

    if (elements.notificationIcon) {
        elements.notificationIcon.textContent = iconMap[type] || 'check_circle';
    }

    // Atualiza classe de tipo para estilização via CSS
    elements.notification.classList.remove('notif-success', 'notif-error', 'notif-warning', 'notif-info');
    elements.notification.classList.add(`notif-${type}`);
    elements.notification.classList.remove('hidden');
    elements.notification.classList.add('show');

    setTimeout(() => {
        elements.notification.classList.remove('show');
        setTimeout(() => elements.notification.classList.add('hidden'), 300);
    }, 3000);
}

function loadTheme() {
    const savedTheme = localStorage.getItem('theme') || 'light';
    if (savedTheme === 'dark') {
        elements.html.classList.add('dark');
        elements.themeIcon.textContent = 'light_mode';
    } else {
        elements.themeIcon.textContent = 'dark_mode';
    }
}

function scrollToOutput() {
    if (!elements.mainContent) return;
    const outputCard = document.querySelector('.output-card');
    if (outputCard) {
        outputCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
}

// ========================================
// HISTÓRICO E STORAGE
// ========================================

function getHistory() {
    return JSON.parse(localStorage.getItem('history') || '[]');
}

function getFavorites() {
    return JSON.parse(localStorage.getItem('favorites') || '[]');
}

function saveToHistory(original, translation, from, to) {
    const history = getHistory();
    history.unshift({ original, translation, from, to, date: new Date().toISOString() });
    if (history.length > 100) history.splice(100);
    localStorage.setItem('history', JSON.stringify(history));
}

function saveFavorite(original, translation, from, to) {
    const favorites = getFavorites();
    favorites.unshift({ original, translation, from, to, date: new Date().toISOString() });
    if (favorites.length > 100) favorites.splice(100);
    localStorage.setItem('favorites', JSON.stringify(favorites));
    showNotification('Adicionado aos favoritos!', 'success');
}

function removeFromHistory(index) {
    const history = getHistory();
    history.splice(index, 1);
    localStorage.setItem('history', JSON.stringify(history));
    renderHistory();
    showNotification('Removido do histórico', 'info');
}

function removeFromFavorites(index) {
    const favorites = getFavorites();
    favorites.splice(index, 1);
    localStorage.setItem('favorites', JSON.stringify(favorites));
    renderFavorites();
    showNotification('Removido dos favoritos', 'info');
}

function clearAllHistory() {
    if (confirm('Tem certeza que deseja limpar todo o histórico?')) {
        localStorage.setItem('history', '[]');
        renderHistory();
        showNotification('Histórico limpo', 'info');
    }
}

// ========================================
// RENDERIZAÇÃO DE LISTAS
// ========================================

function renderHistory() {
    const historyList = document.getElementById('historyList');
    if (!historyList) return;

    const history = getHistory();

    if (history.length === 0) {
        historyList.innerHTML = '<p class="empty-message">Nenhuma tradução no histórico</p>';
        return;
    }

    historyList.innerHTML = history.map((item, index) => `
        <div class="history-item" data-index="${index}">
            <div class="history-item-header">
                <div class="history-item-langs">
                    <span>${item.from.split('-')[0].toUpperCase()}</span>
                    <span>→</span>
                    <span>${item.to.split('-')[0].toUpperCase()}</span>
                </div>
                <div class="history-item-actions">
                    <button class="history-action-btn favorite" title="Adicionar aos favoritos" data-action="favorite">
                        <span class="material-symbols-outlined">star</span>
                    </button>
                    <button class="history-action-btn delete" title="Remover" data-action="delete">
                        <span class="material-symbols-outlined">delete</span>
                    </button>
                </div>
            </div>
            <div class="history-item-text">
                <div class="history-item-original">${escapeHtml(item.original)}</div>
                <div class="history-item-translation">${escapeHtml(item.translation)}</div>
            </div>
            <div class="history-item-date">${formatDate(item.date)}</div>
        </div>
    `).join('');

    historyList.querySelectorAll('.history-item').forEach(itemEl => {
        const idx = parseInt(itemEl.dataset.index, 10);
        itemEl.querySelector('[data-action="favorite"]').addEventListener('click', () => handleAddToFavorites(idx));
        itemEl.querySelector('[data-action="delete"]').addEventListener('click', () => removeFromHistory(idx));
    });
}

function renderFavorites() {
    const favoritesList = document.getElementById('favoritesList');
    if (!favoritesList) return;

    const favorites = getFavorites();

    if (favorites.length === 0) {
        favoritesList.innerHTML = '<p class="empty-message">Nenhuma tradução salva</p>';
        return;
    }

    favoritesList.innerHTML = favorites.map((item, index) => `
        <div class="favorite-item" data-index="${index}">
            <div class="favorite-item-content">
                <div class="favorite-item-original">${escapeHtml(item.original)}</div>
                <div class="favorite-item-translation">${escapeHtml(item.translation)}</div>
            </div>
            <div class="favorite-item-actions">
                <button class="favorite-action-btn copy" title="Copiar original" data-action="copy">
                    <span class="material-symbols-outlined">content_copy</span>
                </button>
                <button class="favorite-action-btn delete" title="Remover" data-action="delete">
                    <span class="material-symbols-outlined">delete</span>
                </button>
            </div>
        </div>
    `).join('');

    // Guarda referência antes de adicionar listeners para evitar recapturar dados antigos
    const snapshot = [...favorites];

    favoritesList.querySelectorAll('.favorite-item').forEach(itemEl => {
        const idx = parseInt(itemEl.dataset.index, 10);
        itemEl.querySelector('[data-action="copy"]').addEventListener('click', () => {
            copyToClipboard(snapshot[idx].original);
        });
        itemEl.querySelector('[data-action="delete"]').addEventListener('click', () => {
            removeFromFavorites(idx);
        });
    });
}

function handleAddToFavorites(index) {
    const history = getHistory();
    const item = history[index];
    if (item) {
        saveFavorite(item.original, item.translation, item.from, item.to);
        renderHistory();
    }
}

// ========================================
// NAVEGAÇÃO
// ========================================

function handleNavigation(page) {
    showSection(page);
    const labels = {
        translate: 'Tradutora',
        history: 'Histórico',
        favorites: 'Favoritos',
    };
    showNotification(labels[page] || page, 'info');
}

function showSection(section) {
    document.querySelectorAll(
        '.translate-card, .action-buttons, .info-section, .history-section, .favorites-section'
    ).forEach(el => el.classList.add('hidden'));

    if (section === 'translate') {
        document.querySelectorAll('.translate-card, .action-buttons, .info-section').forEach(el => {
            el.classList.remove('hidden');
        });
    } else if (section === 'history') {
        const historySection = document.getElementById('historySection');
        if (historySection) {
            historySection.classList.remove('hidden');
            renderHistory();
            elements.mainContent.scrollTop = 0;
        }
    } else if (section === 'favorites') {
        const favoritesSection = document.getElementById('favoritesSection');
        if (favoritesSection) {
            favoritesSection.classList.remove('hidden');
            renderFavorites();
            elements.mainContent.scrollTop = 0;
        }
    }
}

// ========================================
// UTILITÁRIOS
// ========================================

function vibrate(duration = 50) {
    if ('vibrate' in navigator) {
        navigator.vibrate(duration);
    }
}

function checkConnection() {
    if (!navigator.onLine) {
        showNotification('Sem conexão com a internet', 'warning');
        return false;
    }
    return true;
}

function escapeHtml(text) {
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
}

/**
 * Formata uma data ISO para exibição relativa.
 * Corrige o bug do Math.ceil que impedia "hoje" de ser detectado.
 */
function formatDate(isoDate) {
    const date = new Date(isoDate);
    const now = new Date();

    // Zera o horário para comparar apenas as datas (dia/mes/ano)
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const itemDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const diffDays = Math.round((today - itemDay) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
        return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    } else if (diffDays === 1) {
        return 'Ontem';
    } else if (diffDays < 7) {
        return `${diffDays}d atrás`;
    } else {
        return date.toLocaleDateString('pt-BR');
    }
}

// ========================================
// SCROLL E ANIMAÇÕES
// ========================================

/**
 * Unifica handleScrollIndicator e autoHideScrollbar em um único listener,
 * evitando dois eventListeners separados no mesmo elemento.
 */
function initScrollFeatures() {
    if (!elements.mainContent) return;

    let scrollTimeout;
    let hideTimeout;

    elements.mainContent.addEventListener('scroll', () => {
        // Indicador visual no phone-container
        if (elements.phoneContainer) {
            elements.phoneContainer.classList.add('scrolling');
            clearTimeout(scrollTimeout);
            scrollTimeout = setTimeout(() => {
                elements.phoneContainer.classList.remove('scrolling');
            }, 1000);
        }

        // Auto-hide da scrollbar
        elements.mainContent.classList.add('scrolling');
        clearTimeout(hideTimeout);
        hideTimeout = setTimeout(() => {
            elements.mainContent.classList.remove('scrolling');
        }, 1500);
    });

    elements.mainContent.scrollTop = 0;
    elements.mainContent.style.scrollBehavior = 'smooth';
}

function addTypingEffect() {
    if (!elements.inputText) return;
    let typingTimer;
    elements.inputText.addEventListener('input', () => {
        elements.inputText.classList.add('typing');
        clearTimeout(typingTimer);
        typingTimer = setTimeout(() => elements.inputText.classList.remove('typing'), 500);
    });
}

function pulseTranslateButton() {
    if (!elements.inputText || !elements.translateBtn) return;
    elements.inputText.addEventListener('input', () => {
        elements.translateBtn.classList.toggle('pulse', elements.inputText.value.trim().length > 3);
    });
}

function showSuccessAnimation() {
    const outputCard = document.querySelector('.output-card');
    if (outputCard) {
        outputCard.classList.add('success-flash');
        setTimeout(() => outputCard.classList.remove('success-flash'), 600);
    }
}

function addHapticFeedback() {
    document.querySelectorAll('button').forEach(button => {
        button.addEventListener('click', () => vibrate(10));
    });
}

function preventDoubleTapZoom() {
    let lastTouchEnd = 0;
    document.addEventListener('touchend', (e) => {
        const now = Date.now();
        if (now - lastTouchEnd <= 300) e.preventDefault();
        lastTouchEnd = now;
    }, false);
}

function monitorConnection() {
    window.addEventListener('online', () => showNotification('Conexão restaurada', 'success'));
    window.addEventListener('offline', () => showNotification('Sem conexão com a internet', 'error'));
}

function lazyLoadResources() {
    if ('fonts' in document) {
        Promise.all([
            document.fonts.load('400 1em Inter'),
            document.fonts.load('600 1em Inter'),
        ]).catch(err => console.warn('Aviso: Erro ao pré-carregar fontes:', err));
    }
}

function cleanOldCache() {
    const history = getHistory();
    const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
    const cleaned = history.filter(item => new Date(item.date).getTime() > thirtyDaysAgo);

    if (cleaned.length !== history.length) {
        localStorage.setItem('history', JSON.stringify(cleaned));
        console.log(`🧹 Limpeza: ${history.length - cleaned.length} itens antigos removidos`);
    }
}

// ========================================
// ATALHOS DE TECLADO
// ========================================

function initKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
        const ctrl = e.ctrlKey || e.metaKey;

        if (ctrl && e.key === 'k') {
            e.preventDefault();
            elements.inputText.focus();
        }

        if (ctrl && e.shiftKey && e.key === 'C') {
            e.preventDefault();
            copyToClipboard(elements.outputText.value);
        }

        if (ctrl && e.shiftKey && e.key === 'S') {
            e.preventDefault();
            swapLanguages();
        }

        if (ctrl && e.key === 'd') {
            e.preventDefault();
            toggleTheme();
        }

        if (e.key === 'Escape') {
            elements.inputText.value = '';
            elements.outputText.value = '';
            updateCounter(elements.inputCounter, '');
            updateCounter(elements.outputCounter, '');
            elements.inputText.focus();
        }
    });
}

// ========================================
// EVENT LISTENERS
// ========================================

function initEventListeners() {
    if (elements.translateBtn) {
        elements.translateBtn.addEventListener('click', handleTranslation);
    }

    if (elements.swapBtn) {
        elements.swapBtn.addEventListener('click', swapLanguages);
    }

    if (elements.copyInputBtn) {
        elements.copyInputBtn.addEventListener('click', () => copyToClipboard(elements.inputText.value));
    }

    if (elements.copyOutputBtn) {
        elements.copyOutputBtn.addEventListener('click', () => copyToClipboard(elements.outputText.value));
    }

    if (elements.themeToggle) {
        elements.themeToggle.addEventListener('click', toggleTheme);
    }

    if (elements.inputText) {
        elements.inputText.addEventListener('input', (e) => {
            updateCounter(elements.inputCounter, e.target.value);
            limitCharacters(e);
            autoTranslate();
        });

        elements.inputText.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.key === 'Enter') {
                e.preventDefault();
                handleTranslation();
            }
        });
    }

    if (elements.langFrom) {
        elements.langFrom.addEventListener('change', () => {
            if (elements.inputText.value.trim()) autoTranslate();
        });
    }

    if (elements.langTo) {
        elements.langTo.addEventListener('change', () => {
            if (elements.inputText.value.trim()) autoTranslate();
        });
    }

    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            document.querySelectorAll('.nav-item').forEach(nav => nav.classList.remove('active'));
            item.classList.add('active');
            handleNavigation(item.getAttribute('data-page'));
        });
    });

    const clearHistoryBtn = document.getElementById('clearHistoryBtn');
    if (clearHistoryBtn) {
        clearHistoryBtn.addEventListener('click', clearAllHistory);
    }
}

// ========================================
// INICIALIZAÇÃO
// ========================================

function init() {
    loadTheme();
    initEventListeners();
    initScrollFeatures();
    initKeyboardShortcuts();
    addTypingEffect();
    pulseTranslateButton();
    addHapticFeedback();
    preventDoubleTapZoom();
    monitorConnection();
    lazyLoadResources();
    cleanOldCache();
    showSection('translate');

    if (elements.inputText) {
        elements.inputText.focus();
    }

    console.log('✅ Tradutor inicializado com sucesso!');

    setTimeout(() => {
        showNotification('Bem-vindo ao Tradutor!', 'info');
    }, 500);
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

// ========================================
// SERVICE WORKER (PWA - Opcional)
// ========================================

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        // Descomente para ativar PWA:
        // navigator.serviceWorker.register('/sw.js')
        //     .then(() => console.log('✅ Service Worker registrado'))
        //     .catch(err => console.warn('❌ Erro no Service Worker:', err));
    });
}