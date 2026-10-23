// js/club.js — regras de "Vinhos do clube": mês de entrega, visibilidade e nota.
// Usado pela página (navegador) e pelo servidor.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.Club = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
  const MONTH_NAMES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

  const monthParts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit' });

  function isValidMonth(value) {
    return typeof value === 'string' && MONTH_RE.test(value);
  }

  // Mês atual ("AAAA-MM") no horário de São Paulo: a virada do mês é à meia-noite de lá.
  function currentMonth(now) {
    const parts = {};
    for (const p of monthParts.formatToParts(new Date(now === undefined ? Date.now() : now))) parts[p.type] = p.value;
    return parts.year + '-' + parts.month;
  }

  // O vinho aparece (e pode ser avaliado) a partir do primeiro dia do mês dele.
  // Os dois meses são "AAAA-MM", então a comparação de texto é a de data.
  function isVisible(month, current) {
    return month <= current;
  }

  function monthLabel(month) {
    if (!isValidMonth(month)) return String(month);
    return MONTH_NAMES[Number(month.slice(5)) - 1] + ' de ' + month.slice(0, 4);
  }

  function isValidRating(value) {
    return Number.isInteger(value) && value >= 1 && value <= 5;
  }

  return { isValidMonth, currentMonth, isVisible, monthLabel, isValidRating };
});
