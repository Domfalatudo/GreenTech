window.RaizFirebase = {
  apiKey: "AIzaSyAF2qejQfawoGnjK1eYKpcewNZnJVHhuEM",
  authDomain: "raiz-d6870.firebaseapp.com",
  projectId: "raiz-d6870",
  storageBucket: "raiz-d6870.firebasestorage.app",
  messagingSenderId: "978300161149",
  appId: "1:978300161149:web:d702dfc58ad3631f437514",

  redirecionarAposEntrar: "index.html",

  habilitarMicrosoft: false,
};

window.RaizFirebasePronto = function () {
  var config = window.RaizFirebase || {};
  var chave = String(config.apiKey || "");
  return !!chave && chave.indexOf("COLE_AQUI") === -1 && !!config.projectId;
};
