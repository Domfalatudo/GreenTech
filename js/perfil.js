import {
  initializeApp,
  getApps,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const ROTULOS = {
  energia: "Energia",
  hardware: "Hardware",
  dados: "Dados",
  educacao: "Educacao",
  regulacao: "Regulacao",
  comunidades: "Comunidades",
};

const PERFIS = {
  estudante: "Estudante",
  docente: "Professor(a)",
  pesquisa: "Pesquisador(a)",
  dev: "Desenvolvedor(a)",
  comunidade: "Comunidade / ONG",
  outro: "Outro",
};

const PROVEDORES = {
  google: "Google",
  microsoft: "Microsoft",
  password: "E-mail e senha",
};

function campo(nome) {
  return document.querySelector(`[data-perfil-${nome}]`);
}

let estadoAtual = "carregando";

function mostrar(estado) {
  estadoAtual = estado;
  document.querySelectorAll("[data-estado]").forEach((secao) => {
    secao.hidden = secao.getAttribute("data-estado") !== estado;
  });
  const alvo = document.querySelector("[data-perfil]");
  if (alvo) alvo.setAttribute("data-perfil", estado);
}

function iniciais(nome) {
  const partes = String(nome || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!partes.length) return "?";
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

function dataBruta(valor) {
  if (!valor) return null;
  if (typeof valor.toDate === "function") return valor.toDate();
  if (valor instanceof Date) return valor;
  const d = new Date(valor);
  return Number.isNaN(d.getTime()) ? null : d;
}

function dataFormatada(valor) {
  const d = dataBruta(valor);
  if (!d) return "Nao informada";
  return d.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function pintarFoto(usuario, nome) {
  const caixa = campo("foto");
  if (!caixa) return;
  caixa.textContent = "";

  if (usuario && usuario.photoURL) {
    const img = document.createElement("img");
    img.src = usuario.photoURL;
    img.alt = "";
    img.referrerPolicy = "no-referrer";
    img.addEventListener("error", () => {
      caixa.textContent = iniciais(nome);
    });
    caixa.appendChild(img);
    return;
  }

  if (window.RaizHeader && window.RaizHeader.corDe) {
    caixa.style.background = window.RaizHeader.corDe(nome);
  }
  caixa.textContent = iniciais(nome);
}

function pintarInteresses(lista) {
  const alvo = campo("interesses");
  if (!alvo) return;
  alvo.textContent = "";

  if (!Array.isArray(lista) || !lista.length) {
    const vazio = document.createElement("span");
    vazio.className = "perfil-vazio";
    vazio.textContent = "Nenhum tema escolhido ainda.";
    alvo.appendChild(vazio);
    return;
  }

  const caixa = document.createElement("div");
  caixa.className = "perfil-interesses";
  lista.forEach((chave) => {
    const item = document.createElement("span");
    item.className = "perfil-interesse";
    item.textContent = ROTULOS[chave] || chave;
    caixa.appendChild(item);
  });
  alvo.appendChild(caixa);
}

function preencher(usuario, dados, aviso) {
  const perfil = dados || {};
  const nome =
    (perfil.nome && perfil.nome.trim()) ||
    usuario.displayName ||
    (usuario.email ? usuario.email.split("@")[0] : "Visitante");

  const h1 = campo("nome");
  if (h1) h1.textContent = nome;

  const email = campo("email");
  if (email) email.textContent = usuario.email || "Sem e-mail informado";

  pintarFoto(usuario, nome);

  const provedor = campo("provedor");
  if (provedor) {
    const id = (perfil.provedor || "").toLowerCase();
    provedor.textContent = PROVEDORES[id] || "Conta";
  }

  const verificado = campo("verificado");
  if (verificado) verificado.hidden = !usuario.emailVerified;

  const tipo = campo("tipo");
  if (tipo) tipo.textContent = PERFIS[perfil.perfil] || "Nao informado";

  const cidade = campo("cidade");
  if (cidade) cidade.textContent = perfil.cidade || "Nao informada";

  pintarInteresses(perfil.interesses);

  const news = campo("newsletter");
  if (news) news.textContent = perfil.newsletter ? "Inscrito" : "Nao inscrito";

  const criada = campo("criada");
  if (criada) {
    criada.textContent = dataFormatada(
      perfil.criadoEm || (usuario.metadata && usuario.metadata.creationTime),
    );
  }

  const nota = campo("nota");
  if (nota) {
    const viaSocial =
      perfil.provedor === "google" || perfil.provedor === "microsoft";
    const semCadastro = viaSocial && !perfil.criadoEm;


    if (aviso) {
      nota.hidden = false;
      nota.textContent = aviso;
    } else if (semCadastro) {
      nota.hidden = false;
      nota.textContent =
        "Voce entrou pelo login social, entao perfil, cidade e interesses " +
        "ainda estao em branco. Voce pode preencher quando quiser.";
    } else {
      nota.hidden = true;
    }
  }
}


function provedorDe(usuario) {
  const dados = (usuario && usuario.providerData) || [];
  for (let i = 0; i < dados.length; i++) {
    const id = dados[i] && dados[i].providerId;
    if (id === "google.com") return "google";
    if (id === "microsoft.com") return "microsoft";
    if (id === "password") return "password";
  }
  if (usuario && usuario.email) return "password";
  return "";
}


async function buscarDados(db, uid, usuario) {
  if (!db) {
    return {
      dados: null,
      aviso: "O Firestore nao inicializou, entao so os dados de login aparecem aqui.",
    };
  }
  try {
    const documento = await comTempoLimite(
      getDoc(doc(db, "users", uid)),
      LIMITE_LEITURA,
      "timeout-firestore",
    );
    if (!documento.exists()) {

      const semeado = {
        nome: (usuario && usuario.displayName) || "",
        email: (usuario && usuario.email) || "",
        perfil: "",
        cidade: "",
        interesses: [],
        newsletter: false,
        provedor: provedorDe(usuario),
        atualizadoEm: serverTimestamp(),
      };
      try {
        await setDoc(doc(db, "users", uid), semeado, { merge: true });
        return {
          dados: semeado,
          aviso:
            "Criei seu perfil a partir da sua conta " +
            (PROVEDORES[semeado.provedor] || "social") +
            ". Perfil, cidade e interesses ficam em branco ate voce preencher.",
        };
      } catch (erroEscrita) {
        console.error("Raiz: falha ao criar o perfil que faltava.", erroEscrita);
        return {
          dados: null,
          aviso:
            "Sua conta esta conectada, mas o Firestore nao permitiu criar o " +
            "documento do seu perfil (" +
            ((erroEscrita && erroEscrita.code) || "erro") +
            "). Confira as regras em Firestore Database > Rules.",
        };
      }
    }
    return { dados: documento.data(), aviso: "" };
  } catch (erro) {
    console.error("Raiz: falha ao ler o perfil no Firestore.", erro);

    if (erro && erro.code === "permission-denied") {
      return {
        dados: null,
        aviso:
          "As regras do Firestore bloquearam a leitura dos seus dados. " +
          "No console do Firebase, va em Firestore Database > Rules e cole o " +
          "conteudo de firestore.rules.",
      };
    }
    if (erro && erro.message === "timeout-firestore") {
      return {
        dados: null,
        aviso:
          "Nao consegui falar com o Firestore a tempo. No console do Firebase, " +
          "confirme em Firestore Database que o banco de dados JA FOI CRIADO " +
          "(botao \"Create database\") e que a API Firestore esta ativada em " +
          "Build > APIs. Enquanto isso, os dados de login abaixo estao corretos.",
      };
    }
    return {
      dados: null,
      aviso:
        "Nao consegui ler os dados extras do seu perfil (" +
        ((erro && erro.code) || "erro desconhecido") +
        "). Os dados de login abaixo continuam corretos.",
    };
  }
}

const config = window.RaizFirebase || {};
const configurado =
  typeof window.RaizFirebasePronto === "function" && window.RaizFirebasePronto();



const LIMITE_LEITURA = 10000;
const LIMITE_GERAL = 15000;


const dicaHttpLocal =
  "Se voce abriu o arquivo com dois cliques, ele esta rodando em file://. " +
  "O Firebase so funciona por http: sirva a pasta com " +
  '"npx serve ." ou "python -m http.server" e abra http://localhost:3000/pages/perfil.html.';

function mostrarErro(mensagem) {
  mostrar("erro");
  const alvo = document.querySelector("[data-perfil-erro]");
  if (alvo) alvo.textContent = mensagem;
}

function comTempoLimite(promessa, ms, mensagem) {
  return new Promise((resolve, reject) => {
    const relogio = setTimeout(() => reject(new Error(mensagem)), ms);
    promessa.then(
      (valor) => {
        clearTimeout(relogio);
        resolve(valor);
      },
      (erro) => {
        clearTimeout(relogio);
        reject(erro);
      },
    );
  });
}


const vigia = setTimeout(() => {
  if (estadoAtual === "carregando") {
    mostrarErro("Demorou demais para responder. " + dicaHttpLocal);
  }
}, LIMITE_GERAL);

window.addEventListener("error", (evento) => {
  if (estadoAtual === "carregando") {
    mostrarErro("Falha ao carregar a pagina. " + dicaHttpLocal);
  }
  console.error("Raiz: erro na pagina de perfil.", evento.error || evento.message);
});

window.addEventListener("unhandledrejection", (evento) => {
  if (estadoAtual === "carregando") {
    mostrarErro("Falha inesperada ao buscar seus dados. " + dicaHttpLocal);
  }
  console.error("Raiz: promessa rejeitada na pagina de perfil.", evento.reason);
});

if (!configurado) {
  clearTimeout(vigia);
  mostrarErro(
    "O Firebase nao esta configurado. Preencha js/firebase-config.js para ver o perfil.",
  );
} else {
  let auth = null;
  let db = null;
  try {
    const app = getApps().length ? getApps()[0] : initializeApp(config);
    auth = getAuth(app);
    db = getFirestore(app);
  } catch (erro) {
    console.error("Raiz: nao foi possivel iniciar o Firebase.", erro);
  }

  const botaoSair = document.querySelector("[data-perfil-sair]");
  if (botaoSair && auth) {
    botaoSair.addEventListener("click", () => {
      botaoSair.disabled = true;
      signOut(auth)
        .then(() => {
          window.location.href = "index.html";
        })
        .catch((erro) => {
          console.error("Raiz: falha ao sair.", erro);
          botaoSair.disabled = false;
        });
    });
  }

  const botaoTentar = document.querySelector("[data-perfil-tentar]");
  if (botaoTentar) {
    botaoTentar.addEventListener("click", () => {
      window.location.reload();
    });
  }

  if (!auth) {
    clearTimeout(vigia);
    mostrarErro("Nao foi possivel iniciar o Firebase. " + dicaHttpLocal);
  } else {

    comTempoLimite(
      new Promise((resolver) => {
        const cancelar = onAuthStateChanged(auth, (usuario) => {
          resolver(usuario);
          cancelar();
        });
      }),
      LIMITE_LEITURA,
      "timeout-sessao",
    ).then(async (usuario) => {
      clearTimeout(vigia);
      if (!usuario) {
        mostrar("deslogado");
        return;
      }


      const { dados, aviso } = await buscarDados(db, usuario.uid, usuario);
      preencher(usuario, dados, aviso);
      mostrar("logado");
    })
      .catch((erro) => {

        console.error("Raiz: falha ao montar o perfil.", erro);
        clearTimeout(vigia);
        mostrarErro("Nao deu para montar o perfil. " + dicaHttpLocal);
      });
  }
}
