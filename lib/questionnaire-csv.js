// lib/questionnaire-csv.js — exportação das respostas do questionário para
// planilha. Formato pensado para abrir direto no Excel em português: BOM UTF-8
// (acentos), ";" como separador e quebra de linha CRLF.
const Q = require('../js/questionario.js');

const SEPARATOR = ';';
const NEWLINE = '\r\n';

const dateParts = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  day: '2-digit', month: '2-digit', year: 'numeric',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
});

function formatDate(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const p = {};
  for (const part of dateParts.formatToParts(d)) p[part.type] = part.value;
  return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}`;
}

// O Excel mostraria um número de 11 dígitos em notação científica: sai formatado.
function formatPhone(value) {
  const d = String(value || '').replace(/\D/g, '');
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return d;
}

// Texto que começa com = + - @ vira fórmula no Excel: o apóstrofo desarma.
function cell(value) {
  let s = value === null || value === undefined ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  if (/[;"\r\n]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function answerText(answer) {
  if (Array.isArray(answer)) return answer.join(' | ');
  return answer === null || answer === undefined ? '' : String(answer);
}

function buildCsv(rows) {
  const header = ['ID', 'Nome', 'Celular', 'E-mail', 'Versão do questionário', 'Primeiro envio', 'Último envio', 'Nº de envios']
    .concat(Q.QUESTIONS.map((q) => q.id + ' - ' + q.texto));

  const lines = [header.map(cell).join(SEPARATOR)];
  for (const r of rows) {
    const answers = r.answers || {};
    const values = [
      r.subscriberId, r.name, formatPhone(r.phone), r.email, 'v' + r.version,
      formatDate(r.firstSubmittedAt), formatDate(r.submittedAt), r.submissions
    ].concat(Q.QUESTIONS.map((q) => answerText(answers[q.id])));
    lines.push(values.map(cell).join(SEPARATOR));
  }
  return '﻿' + lines.join(NEWLINE) + NEWLINE;
}

module.exports = { buildCsv };
