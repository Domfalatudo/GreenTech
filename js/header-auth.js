import {
  initializeApp,
  getApps,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const config = window.RaizFirebase || {};
const configurado =
  typeof window.RaizFirebasePronto === "function" &&
  window.RaizFirebasePronto();

const header = window.RaizHeader;

if (!header) {
  console.warn("Raiz: header.js nao foi carregado antes de header-auth.js.");
} else if (!configurado) {
  console.warn(
    "Raiz: Firebase nao configurado, conta do header fica deslogada.",
  );
} else {
  try {
    const app = getApps().length ? getApps()[0] : initializeApp(config);
    const auth = getAuth(app);

    header.definirSair(() => {
      signOut(auth).catch((erro) =>
        console.error("Raiz: falha ao sair.", erro),
      );
    });

    onAuthStateChanged(auth, (usuario) => {
      header.render(usuario || null);
    });
  } catch (erro) {
    console.error("Raiz: nao foi possivel observar a sessao.", erro);
  }
}
