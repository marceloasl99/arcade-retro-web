/* ============================================================================
   ROTEADOR — descobre se quem abriu e celular/tablet ou computador e manda
   para a versao certa do jogo.
   ----------------------------------------------------------------------------
   Cada jogo tem dois arquivos:  NOME-desktop.html  e  NOME-mobile.html
   Este script, ao ser carregado numa dessas paginas, redireciona para a versao
   do aparelho (uma vez so, sem laco).
   O index.html (cardapio) tambem usa a funcao detectarMobile() para mostrar
   qual versao recomendar.

   Como forcar a escolha pela barra de enderecos:
     ...?desktop=1   sempre a versao de computador
     ...?mobile=1    sempre a versao de celular
   ============================================================================ */
(function (raiz) {
  "use strict";

  function lerBusca() {
    try { return String((raiz.location && raiz.location.search) || ""); }
    catch (e) { return ""; }
  }

  function forcaDesktop() { return /[?&]desktop=1(?:&|$)/.test(lerBusca()); }
  function forcaMobile()  { return /[?&]mobile=1(?:&|$)/.test(lerBusca()); }

  /* ------------------------ deteccao do aparelho ------------------------- */
  function detectarMobile() {
    if (forcaDesktop()) return false;
    if (forcaMobile()) return true;

    var ua = "", pontos = 0;
    try {
      ua = String(navigator.userAgent || "");
      pontos = navigator.maxTouchPoints || navigator.msMaxTouchPoints || 0;
    } catch (e) {}

    // aparelho com dedo (o ponteiro principal e impreciso)
    var dedoGrosso = false;
    try {
      dedoGrosso = !!(raiz.matchMedia && raiz.matchMedia("(pointer: coarse)").matches);
    } catch (e) {}

    var temToque = false;
    try { temToque = pontos > 0 || ("ontouchstart" in raiz); } catch (e) {}

    var ladoMenor = 99999;
    try {
      if (raiz.screen) ladoMenor = Math.min(raiz.screen.width || 99999, raiz.screen.height || 99999);
    } catch (e) {}

    // user-agent tipico de celular/tablet
    var uaCelular = /android|iphone|ipod|ipad|iemobile|windows phone|blackberry|bb10|opera mini|opera mobi|fennec|maemo|webos|palm|silk|kindle|mobile/i.test(ua);

    // iPad com iPadOS 13+ se apresenta como "Macintosh": so o toque denuncia
    var ipadDisfarcado = /macintosh/i.test(ua) && pontos > 1;

    return uaCelular || ipadDisfarcado || (temToque && dedoGrosso && ladoMenor <= 820);
  }

  /* --------------------- redirecionamento automatico --------------------- */
  function versaoDaPagina() {
    var pagina = "";
    try { pagina = String((raiz.location && raiz.location.pathname) || "").split("/").pop(); }
    catch (e) { return null; }
    var m = /^(.*)-(desktop|mobile)\.html$/i.exec(pagina);
    if (!m) return null;
    return { base: m[1], tipo: m[2].toLowerCase(), pagina: pagina };
  }

  var info = versaoDaPagina();
  if (info) {
    var querMobile = detectarMobile();
    var desejada = (querMobile ? info.base + "-mobile.html" : info.base + "-desktop.html");
    if (desejada.toLowerCase() !== info.pagina.toLowerCase()) {
      raiz.__redirecionando = true;   // as paginas conferem isto antes de comecar
      try { raiz.location.replace(desejada + lerBusca()); } catch (e) {}
    }
  }

  /* ------------------------- sistema de idioma ------------------------- */
  function obterIdioma() {
    var busca = lerBusca();
    var m = /[?&]lang=(en|pt)(?:&|$)/i.exec(busca);
    if (m) return m[1].toLowerCase();
    try {
      var salvo = raiz.localStorage && raiz.localStorage.getItem('arcade_lang');
      if (salvo === 'en' || salvo === 'pt') return salvo;
    } catch (e) {}
    return 'en'; // Inglês como padrão
  }

  function definirIdioma(lang) {
    if (lang !== 'en' && lang !== 'pt') lang = 'en';
    try {
      if (raiz.localStorage) raiz.localStorage.setItem('arcade_lang', lang);
    } catch (e) {}
    aplicarIdiomaNoDOM(lang);
    return lang;
  }

  function alternarIdioma() {
    var atual = obterIdioma();
    var novo = (atual === 'en' ? 'pt' : 'en');
    definirIdioma(novo);
    return novo;
  }

  function aplicarIdiomaNoDOM(lang) {
    if (!lang) lang = obterIdioma();
    try {
      if (raiz.document) {
        raiz.document.documentElement.lang = (lang === 'en' ? 'en' : 'pt-BR');
        var elementos = raiz.document.querySelectorAll('[data-en]');
        for (var i = 0; i < elementos.length; i++) {
          var el = elementos[i];
          var txt = el.getAttribute('data-' + lang);
          if (txt !== null) {
            if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') el.value = txt;
            else el.innerHTML = txt;
          }
        }
        var btns = raiz.document.querySelectorAll('.btn-lang-toggle');
        for (var j = 0; j < btns.length; j++) {
          btns[j].innerHTML = (lang === 'en' ? '🇺🇸 EN &middot; PT' : '🇧🇷 PT &middot; EN');
        }
      }
    } catch (e) {}
  }

  if (typeof raiz.document !== 'undefined') {
    if (raiz.document.readyState === 'loading') {
      raiz.document.addEventListener('DOMContentLoaded', function () { aplicarIdiomaNoDOM(); });
    } else {
      aplicarIdiomaNoDOM();
    }
  }

  raiz.detectarMobile = detectarMobile;
  raiz.forcaDesktop = forcaDesktop;
  raiz.forcaMobile = forcaMobile;
  raiz.obterIdioma = obterIdioma;
  raiz.definirIdioma = definirIdioma;
  raiz.alternarIdioma = alternarIdioma;
  raiz.aplicarIdiomaNoDOM = aplicarIdiomaNoDOM;
})(typeof window !== "undefined" ? window : this);
