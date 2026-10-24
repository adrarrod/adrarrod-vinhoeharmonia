// js/clube.js — regras da contratação do Clube V&H Personnalité (plano, CPF,
// celular, maioridade, CEP de São Paulo, status da assinatura). Usado pela página
// e pelo servidor, que confere tudo de novo.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.Clube = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  const PLAN = { id: 'personnalite', name: 'Clube V&H Personnalité', priceCents: 12000, winesPerMonth: 2 };
  const SLOGAN = 'Seu paladar é único. Seus vinhos também.';
  // Versão dos textos legais aceitos no cadastro (Termos de Uso, Política de
  // Privacidade e condições da assinatura). Trocar quando os textos mudarem.
  const LEGAL_VERSION = 'rascunho-2026-10';
  const OUT_OF_AREA_MESSAGE = 'Que bom ter seu interesse! Neste momento, o Clube V&H Personnalité atende somente endereços no estado de São Paulo. Esperamos chegar à sua região em breve.';

  // ---------------------------------------------------------------- status --
  const STATUSES = ['awaiting_payment', 'active', 'payment_pending', 'cancelled', 'suspended'];
  const LABELS = {
    awaiting_payment: 'Aguardando pagamento',
    active: 'Ativa',
    payment_pending: 'Pagamento pendente',
    cancelled: 'Cancelada',
    suspended: 'Suspensa'
  };
  // Cancelada é definitiva; para voltar, o cliente faz uma nova assinatura.
  const TRANSITIONS = {
    awaiting_payment: ['active', 'cancelled'],
    active: ['payment_pending', 'cancelled', 'suspended'],
    payment_pending: ['active', 'cancelled'],
    suspended: ['active', 'cancelled'],
    cancelled: []
  };
  // Estes status impedem uma segunda assinatura do mesmo plano para o mesmo cliente.
  const OPEN_STATUSES = ['awaiting_payment', 'active', 'payment_pending', 'suspended'];

  function statusLabel(status) {
    return LABELS[status] || String(status);
  }

  function canTransition(from, to) {
    return Object.prototype.hasOwnProperty.call(TRANSITIONS, from) && TRANSITIONS[from].includes(to);
  }

  function isOpen(status) {
    return OPEN_STATUSES.includes(status);
  }

  // ------------------------------------------------------------ documentos --
  function cleanDigits(value) {
    return typeof value === 'string' ? value.replace(/\D/g, '') : '';
  }

  function isValidCpf(value) {
    if (typeof value !== 'string') return false;
    const d = cleanDigits(value);
    if (!/^\d{11}$/.test(d) || /^(\d)\1{10}$/.test(d)) return false;
    const digit = (length) => {
      let sum = 0;
      for (let i = 0; i < length; i++) sum += Number(d[i]) * (length + 1 - i);
      const rest = (sum * 10) % 11;
      return rest === 10 ? 0 : rest;
    };
    return digit(9) === Number(d[9]) && digit(10) === Number(d[10]);
  }

  // Celular: DDD (11 a 99) + 9 + oito números.
  function isValidMobile(value) {
    if (typeof value !== 'string') return false;
    return /^[1-9][1-9]9\d{8}$/.test(cleanDigits(value));
  }

  // ---------------------------------------------------------- data / idade --
  const dayParts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' });

  // Hoje em São Paulo, "AAAA-MM-DD".
  function today(now) {
    const p = {};
    for (const part of dayParts.formatToParts(new Date(now === undefined ? Date.now() : now))) p[part.type] = part.value;
    return p.year + '-' + p.month + '-' + p.day;
  }

  function isRealDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const [y, m, d] = value.split('-').map(Number);
    const date = new Date(Date.UTC(y, m - 1, d));
    return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
  }

  // Data de nascimento real, de 1900 em diante e não futura.
  function isValidBirthDate(value, now) {
    return isRealDate(value) && value >= '1900-01-01' && value <= today(now);
  }

  // 18 anos completos hoje (horário de São Paulo). As datas são "AAAA-MM-DD",
  // então comparar o texto é comparar a data.
  function isAdult(birthDate, now) {
    if (!isRealDate(birthDate)) return false;
    const t = today(now);
    return birthDate <= (Number(t.slice(0, 4)) - 18) + t.slice(4);
  }

  // ------------------------------------------------------------------- CEP --
  // São Paulo (estado): de 01000-000 a 19999-999.
  function isSaoPauloCep(value) {
    if (typeof value !== 'string') return false;
    const d = cleanDigits(value);
    if (!/^\d{8}$/.test(d)) return false;
    const n = Number(d);
    return n >= 1000000 && n <= 19999999;
  }

  // ------------------------------------------------------ link de pagamento --
  function isValidPaymentLink(value) {
    if (typeof value !== 'string' || value.length > 2000 || /\s/.test(value)) return false;
    try {
      const url = new URL(value);
      return url.protocol === 'https:' && url.hostname.includes('.');
    } catch (err) {
      return false;
    }
  }

  return {
    PLAN, SLOGAN, LEGAL_VERSION, OUT_OF_AREA_MESSAGE, STATUSES, OPEN_STATUSES, TRANSITIONS,
    statusLabel, canTransition, isOpen, cleanDigits, isValidCpf, isValidMobile,
    today, isValidBirthDate, isAdult, isSaoPauloCep, isValidPaymentLink
  };
});
