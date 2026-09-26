import {
  initializeApp,
  getApps,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  OAuthProvider,
  signInWithPopup,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  updateProfile,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore,
  doc,
  setDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const config = window.RaizFirebase || {};
const pronto =
  typeof window.RaizFirebasePronto === "function" &&
  window.RaizFirebasePronto();

const ERROS = {
  "auth/invalid-email": "E-mail invalido. Confira o endereco digitado.",
  "auth/missing-password": "Digite a sua senha.",
  "auth/user-not-found": "Nao encontramos uma conta com esse e-mail.",
  "auth/wrong-password": "E-mail ou senha incorretos.",
  "auth/invalid-credential": "E-mail ou senha incorretos.",
  "auth/invalid-login-credentials": "E-mail ou senha incorretos.",
  "auth/email-already-in-use":
    "Ja existe uma conta com esse e-mail. Tente entrar.",
  "auth/weak-password": "O Firebase exige senha com pelo menos 6 caracteres.",
  "auth/too-many-requests":
    "Muitas tentativas seguidas. Tente de novo em alguns minutos.",
  "auth/network-request-failed": "Falha de rede. Verifique sua conexao.",
  "auth/popup-closed-by-user":
    "Voce fechou a janela de login antes de terminar.",
  "auth/popup-blocked":
    "O navegador bloqueou a janela de login. Permita popups para este site.",
  "auth/cancelled-popup-request":
    "Outro login foi aberto antes deste terminar.",
  "auth/operation-not-allowed":
    "Ative esse provedor em Authentication > Sign-in method, no painel do Firebase.",
  "auth/unauthorized-domain":
    "Esse dominio nao esta autorizado no painel do Firebase (Authentication > Settings).",
  "auth/account-exists-with-different-credential":
    "Ja existe uma conta com esse e-mail usando outro metodo de login.",
};

function mensagemDeErro(erro) {
  if (!erro) return "Algo deu errado. Tente de novo.";
  if (erro.code && ERROS[erro.code]) return ERROS[erro.code];
  if (String(erro.message || "").indexOf("auth/") === 0) {
    return "Nao foi possivel completar o login (" + erro.code + ").";
  }
  return "Nao foi possivel completar o login. Tente de novo.";
}

const caixa = document.querySelector("[data-auth-status]");

function avisar(texto, tom) {
  if (!caixa) return;
  caixa.textContent = texto;
  caixa.setAttribute("data-tone", tom || "info");
  caixa.classList.add("is-visible");
}

let botoesComEstado = null;

function travarBotoes(travado) {
  if (!botoesComEstado) {
    botoesComEstado = Array.from(
      document.querySelectorAll("[data-auth-submit], [data-sso]"),
    ).map((botao) => ({ botao, desativado: botao.disabled }));
  }
  botoesComEstado.forEach(({ botao, desativado }) => {
    if (travado) {
      botao.setAttribute("aria-busy", "true");
      botao.disabled = true;
    } else {
      botao.removeAttribute("aria-busy");
      botao.disabled = desativado;
    }
  });
}

let auth = null;
let db = null;

if (pronto) {
  try {

    const app = getApps().length ? getApps()[0] : initializeApp(config);
    auth = getAuth(app);
    db = getFirestore(app);
  } catch (erro) {
    console.error("Raiz: nao foi possivel iniciar o Firebase.", erro);
  }
}

const semConfiguracao =
  "O Firebase ainda nao esta configurado. Abra o arquivo firebase-config.js e " +
  "cole la os dados do seu projeto (Project settings > General > Your apps).";



async function salvarPerfil(uid, dados, provedor, ehCadastro) {
  if (!db) return;
  const registro = {
    nome: dados.nome || "",
    email: dados.email || "",
    perfil: dados.perfil || "",
    cidade: dados.cidade || "",
    interesses: dados.interesses || [],
    newsletter: !!dados.newsletter,
    provedor: provedor,
    atualizadoEm: serverTimestamp(),
  };

  if (ehCadastro) registro.criadoEm = serverTimestamp();

  await setDoc(doc(db, "users", uid), registro, { merge: true });
}

function redirecionar() {
  const destino = config.redirecionarAposEntrar;
  if (!destino) return;
  window.setTimeout(() => {
    window.location.href = destino;
  }, 900);
}



async function enviarFormulario(envio) {
  const tipo = envio.tipo;
  const dados = envio.dados;
  if (!pronto || !auth) {
    avisar(semConfiguracao, "error");
    return;
  }

  travarBotoes(true);
  try {
    if (dados.lembrar !== undefined) {
      await setPersistence(
        auth,
        dados.lembrar ? browserLocalPersistence : browserSessionPersistence,
      );
    }

    if (tipo === "cadastro") {
      const credencial = await createUserWithEmailAndPassword(
        auth,
        dados.email,
        dados.senha,
      );
      if (dados.nome)
        await updateProfile(credencial.user, { displayName: dados.nome });
      await salvarPerfil(credencial.user.uid, dados, "password", true);
      avisar("Conta criada com sucesso. Entrando...", "ok");
    } else {
      await signInWithEmailAndPassword(auth, dados.email, dados.senha);
      avisar("Login feito. Entrando...", "ok");
    }
    redirecionar();
  } catch (erro) {
    avisar(mensagemDeErro(erro), "error");
    travarBotoes(false);
  }
}

async function entrarComProvedor(nome) {
  if (!pronto || !auth) {
    avisar(semConfiguracao, "error");
    return;
  }

  const ehMicrosoft = nome === "Microsoft";
  if (ehMicrosoft && !config.habilitarMicrosoft) {
    avisar("O login com Microsoft ainda esta em breve.", "info");
    return;
  }

  const provedor = ehMicrosoft
    ? new OAuthProvider("microsoft.com")
    : new GoogleAuthProvider();
  if (!ehMicrosoft) provedor.setCustomParameters({ prompt: "select_account" });

  travarBotoes(true);
  try {
    const resultado = await signInWithPopup(auth, provedor);
    const usuario = resultado.user;
    avisar("Login com " + nome + " feito. Entrando...", "ok");


    try {
      await salvarPerfil(
        usuario.uid,
        { nome: usuario.displayName || "", email: usuario.email || "" },
        ehMicrosoft ? "microsoft" : "google",
      );
    } catch (erroPerfil) {
      console.error("Raiz: nao foi possivel gravar o perfil social.", erroPerfil);
    }

    redirecionar();
  } catch (erro) {
    avisar(mensagemDeErro(erro), "error");
    travarBotoes(false);
  }
}

async function recuperarSenha() {
  if (!pronto || !auth) {
    avisar(semConfiguracao, "error");
    return;
  }
  const campo = document.getElementById("email");
  const email = campo ? campo.value.trim() : "";
  if (!email) {
    avisar(
      "Digite seu e-mail acima para receber o link de recuperacao.",
      "error",
    );
    if (campo) campo.focus();
    return;
  }
  try {
    await sendPasswordResetEmail(auth, email);
    avisar("E-mail de recuperacao enviado. Confira a caixa de entrada.", "ok");
  } catch (erro) {
    avisar(mensagemDeErro(erro), "error");
  }
}



window.RaizAuth = {
  onSubmit: enviarFormulario,
  onSso: entrarComProvedor,
};

const linkRecuperar = document.querySelector("[data-recuperar-senha]");
if (linkRecuperar) {
  linkRecuperar.addEventListener("click", (evento) => {
    evento.preventDefault();
    recuperarSenha();
  });
}


if (pronto && config.habilitarMicrosoft) {
  const botaoMicrosoft = document.querySelector('[data-sso="Microsoft"]');
  if (botaoMicrosoft) {
    botaoMicrosoft.disabled = false;
    botaoMicrosoft.removeAttribute("aria-disabled");
    botaoMicrosoft.removeAttribute("title");
    const badge = botaoMicrosoft.querySelector(".sso-badge");
    if (badge) badge.remove();
  }
}


if (auth) {
  onAuthStateChanged(auth, (usuario) => {
    if (usuario) redirecionar();
  });
}

if (!pronto) {
  console.warn("Raiz: Firebase nao configurado. Preencha firebase-config.js.");
}
