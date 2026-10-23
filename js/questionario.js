// js/questionario.js — Questionário "Clube V&H Personnalité": a definição
// (textos, opções, IDs e obrigatoriedade, exatamente como entregues) e as regras
// de resposta. Usado pela página (navegador) e pelo servidor (que confere tudo
// de novo antes de gravar).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.Questionario = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  const DEFINITION = {
    "produto": "Clube V&H Personnalité",
    "versao": "1.0",
    "titulo": "Vamos descobrir seu paladar?",
    "introducao": "Cada pessoa tem um jeito único de apreciar vinho. Queremos conhecer o seu para escolher rótulos que combinem com seus gostos e apresentar novas descobertas. Não existem respostas certas ou erradas!",
    "etapas": [
      {
        "id": 1,
        "titulo": "O que você gosta de beber?",
        "descricao": "Vamos conhecer um pouquinho do seu gosto.",
        "perguntas": [
          {
            "id": "q1",
            "texto": "Quais tipos de vinho você gosta?",
            "tipo": "multipla",
            "obrigatoria": false,
            "opcoes": [
              "Tintos",
              "Brancos",
              "Rosés",
              "Espumantes",
              "Ainda estou descobrindo"
            ],
            "opcao_exclusiva": "Ainda estou descobrindo"
          },
          {
            "id": "q2",
            "texto": "Quais tipos de vinho gostaria de receber no clube?",
            "tipo": "multipla",
            "obrigatoria": true,
            "opcoes": [
              "Tintos",
              "Brancos",
              "Rosés",
              "Espumantes",
              "Quero experimentar todos os tipos"
            ],
            "opcao_exclusiva": "Quero experimentar todos os tipos"
          },
          {
            "id": "q3",
            "texto": "Você prefere vinhos mais leves ou mais fortes?",
            "tipo": "unica",
            "obrigatoria": true,
            "opcoes": [
              "Leves — mais delicados e fáceis de beber",
              "Médios — equilibrados, nem leves nem fortes",
              "Fortes — com sabor mais intenso e marcante",
              "Gosto de todos",
              "Ainda não sei"
            ]
          }
        ]
      },
      {
        "id": 2,
        "titulo": "Seu jeito de apreciar vinho",
        "descricao": "Não precisa entender de vinho para responder!",
        "perguntas": [
          {
            "id": "q4",
            "texto": "Você prefere vinhos mais secos ou mais docinhos?",
            "tipo": "unica",
            "obrigatoria": true,
            "opcoes": [
              "Secos — sem gosto de açúcar",
              "Um pouquinho adocicados",
              "Docinhos",
              "Gosto dos dois",
              "Não sei dizer"
            ]
          },
          {
            "id": "q5",
            "texto": "Alguns vinhos deixam a boca com uma sensação de secura. O que você acha disso?",
            "tipo": "unica",
            "obrigatoria": true,
            "opcoes": [
              "Prefiro vinhos que não deixam essa sensação",
              "Não me incomoda um pouco dessa sensação",
              "Gosto dessa sensação mais marcante",
              "Nunca reparei nisso"
            ]
          },
          {
            "id": "q6",
            "texto": "Você gosta de vinhos com uma sensação mais fresca, que faz salivar?",
            "tipo": "unica",
            "obrigatoria": true,
            "opcoes": [
              "Sim, gosto dessa sensação",
              "Prefiro vinhos com menos dessa sensação",
              "Gosto dos dois",
              "Nunca reparei nisso"
            ]
          }
        ]
      },
      {
        "id": 3,
        "titulo": "Suas experiências",
        "descricao": "Queremos saber como o vinho faz parte dos seus momentos.",
        "perguntas": [
          {
            "id": "q7",
            "texto": "Você gosta de experimentar vinhos diferentes?",
            "tipo": "unica",
            "obrigatoria": true,
            "opcoes": [
              "Adoro conhecer novidades",
              "Gosto, mas sem fugir muito do que conheço",
              "Prefiro os estilos que já gosto"
            ]
          },
          {
            "id": "q8",
            "texto": "Em quais momentos você costuma tomar vinho?",
            "tipo": "multipla",
            "obrigatoria": false,
            "opcoes": [
              "Durante as refeições",
              "Para relaxar em casa",
              "Com amigos ou família",
              "Em comemorações",
              "Em degustações"
            ]
          },
          {
            "id": "q9",
            "texto": "Você conhece alguma dessas uvas e gosta dos vinhos feitos com elas?",
            "tipo": "multipla",
            "obrigatoria": false,
            "opcoes": [
              "Cabernet Sauvignon",
              "Merlot",
              "Malbec",
              "Carménère",
              "Pinot Noir",
              "Syrah / Shiraz",
              "Outras",
              "Não conheço nenhuma"
            ],
            "opcao_exclusiva": "Não conheço nenhuma"
          },
          {
            "id": "q10",
            "texto": "Existe algum vinho ou tipo de vinho que você não gosta?",
            "tipo": "texto_livre",
            "obrigatoria": false,
            "placeholder": "Conte do seu jeito. Ex.: não gosto de vinhos muito fortes ou muito doces.",
            "limite_caracteres": 500
          }
        ]
      },
      {
        "id": 4,
        "titulo": "Sua experiência no clube",
        "descricao": "Estamos quase terminando!",
        "perguntas": [
          {
            "id": "q11",
            "texto": "O que você mais espera do nosso clube?",
            "tipo": "unica",
            "obrigatoria": true,
            "opcoes": [
              "Receber vinhos que combinem comigo",
              "Conhecer vinhos diferentes",
              "Aprender um pouco mais sobre vinhos",
              "Ter praticidade na hora de escolher",
              "Um pouco de tudo"
            ]
          },
          {
            "id": "q12",
            "texto": "Lembra de algum vinho que você gostou muito?",
            "tipo": "texto_livre",
            "obrigatoria": false,
            "placeholder": "Se lembrar do nome, pode escrever. Se não, tudo bem!",
            "limite_caracteres": 500
          }
        ]
      }
    ],
    "regras": {
      "identificacao": "Associar respostas ao ID do assinante autenticado ou convidado validado por token seguro; nunca confiar em ID editável no frontend.",
      "fluxos": [
        "Assinante atual: convite seguro, completar cadastro, responder questionário.",
        "Novo assinante: contratação, completar cadastro e questionário; permitir preenchimento posterior."
      ],
      "navegacao": "Quatro etapas com barra de progresso, botões Voltar e Continuar, preservação de respostas e revisão antes de enviar.",
      "validacao": "Na publicação, exigir respostas das perguntas marcadas obrigatórias ao concluir; campos opcionais podem ficar vazios. Opções exclusivas desmarcam outras respostas e vice-versa.",
      "persistencia": "Salvar respostas vinculadas ao assinante, data de envio e versão 1.0; permitir consulta no admin e atualização pelo cliente, mantendo histórico se possível.",
      "privacidade": "Informar finalidade da coleta e disponibilizar aviso de privacidade; exigir autenticação ou token seguro, HTTPS e controle de acesso.",
      "escopo": "Não implementar motor de recomendação automático nem IA nesta versão. Curadoria será manual no painel administrativo."
    }
  };

  const VERSION = DEFINITION.versao;
  const STEPS = DEFINITION.etapas;
  const QUESTIONS = STEPS.reduce((all, step) => all.concat(step.perguntas), []);

  const has = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

  function findQuestion(id) {
    return QUESTIONS.find((q) => q.id === id) || null;
  }

  function stepIndexOf(questionId) {
    return STEPS.findIndex((s) => s.perguntas.some((q) => q.id === questionId));
  }

  // Marca/desmarca uma opção e devolve a nova seleção (sem mexer na original).
  // Resposta única sempre vira só a opção clicada. Na múltipla, a opção
  // exclusiva ("Ainda estou descobrindo"...) desmarca as outras e vice-versa.
  function toggleOption(question, selected, option) {
    if (question.tipo === 'unica') return [option];
    const current = Array.isArray(selected) ? selected.slice() : [];
    if (current.includes(option)) return current.filter((o) => o !== option);
    if (question.opcao_exclusiva && option === question.opcao_exclusiva) return [option];
    return current.filter((o) => o !== question.opcao_exclusiva).concat(option);
  }

  function isBlank(question, answer) {
    if (question.tipo === 'multipla') return !Array.isArray(answer) || answer.length === 0;
    return typeof answer !== 'string' || answer.trim() === '';
  }

  // Perguntas obrigatórias da etapa (índice 0..3) que ainda estão sem resposta.
  function missingRequired(stepIndex, answers) {
    const step = STEPS[stepIndex];
    const source = answers && typeof answers === 'object' ? answers : {};
    if (!step) return [];
    return step.perguntas
      .filter((q) => q.obrigatoria && isBlank(q, source[q.id]))
      .map((q) => q.id);
  }

  // Confere e normaliza uma ficha de respostas. Devolve { valid, errors, value }:
  // errors = { q2: 'required' | 'invalid' | 'too_long' }; value tem todas as 12
  // perguntas (múltipla = lista, única = texto ou null, livre = texto), e nada
  // além delas — perguntas desconhecidas são descartadas.
  function validateAnswers(input) {
    const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
    const errors = {};
    const value = {};

    QUESTIONS.forEach((q) => {
      const raw = has(source, q.id) ? source[q.id] : undefined;

      if (q.tipo === 'multipla') {
        let list = [];
        if (raw !== undefined && raw !== null) {
          if (!Array.isArray(raw) || raw.some((o) => typeof o !== 'string' || !q.opcoes.includes(o))) {
            errors[q.id] = 'invalid';
          } else {
            list = q.opcoes.filter((o) => raw.includes(o));
            if (q.opcao_exclusiva && list.includes(q.opcao_exclusiva) && list.length > 1) errors[q.id] = 'invalid';
          }
        }
        value[q.id] = list;
        if (!errors[q.id] && q.obrigatoria && list.length === 0) errors[q.id] = 'required';
        return;
      }

      if (q.tipo === 'unica') {
        let choice = null;
        if (raw !== undefined && raw !== null && !(typeof raw === 'string' && raw.trim() === '')) {
          if (typeof raw !== 'string' || !q.opcoes.includes(raw)) errors[q.id] = 'invalid';
          else choice = raw;
        }
        value[q.id] = choice;
        if (!errors[q.id] && q.obrigatoria && choice === null) errors[q.id] = 'required';
        return;
      }

      // texto_livre
      let text = '';
      if (raw !== undefined && raw !== null) {
        if (typeof raw !== 'string') errors[q.id] = 'invalid';
        else text = raw.trim();
      }
      if (!errors[q.id] && q.limite_caracteres && text.length > q.limite_caracteres) errors[q.id] = 'too_long';
      value[q.id] = text;
      if (!errors[q.id] && q.obrigatoria && text === '') errors[q.id] = 'required';
    });

    return { valid: Object.keys(errors).length === 0, errors, value };
  }

  return { DEFINITION, VERSION, STEPS, QUESTIONS, findQuestion, stepIndexOf, toggleOption, missingRequired, validateAnswers };
});
