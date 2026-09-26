(function () {
  "use strict";

  var EMAIL = /^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/;
  var FRACAS = [
    "senha123",
    "12345678",
    "password",
    "qwertyui",
    "qwerty123",
    "admin123",
    "raiz1234",
    "abc12345",
  ];
  var ROTULOS = [
    "",
    "Senha fraca",
    "Senha razoavel",
    "Senha boa",
    "Senha forte",
  ];
  var MINIMO = "Use pelo menos 8 caracteres, com letra e numero.";

  function todos(seletor, base) {
    return Array.prototype.slice.call(
      (base || document).querySelectorAll(seletor),
    );
  }

  function forcaSenha(valor) {
    if (!valor) return 0;
    if (FRACAS.indexOf(valor.toLowerCase()) >= 0) return 1;
    var pontos = 0;
    if (valor.length >= 8) pontos++;
    if (valor.length >= 12) pontos++;
    if (/[a-z]/.test(valor) && /[A-Z]/.test(valor)) pontos++;
    if (/\d/.test(valor) && /[^A-Za-z0-9]/.test(valor)) pontos++;
    if (pontos <= 1) return 1;
    if (pontos === 2) return 2;
    if (pontos === 3) return 3;
    return 4;
  }

  var REGRAS = {
    nome: function (valor) {
      var texto = valor.trim();
      if (texto.length < 3) return "Informe seu nome completo.";
      if (texto.split(/\s+/).length < 2) return "Digite nome e sobrenome.";
      return true;
    },
    email: function (valor) {
      return (
        EMAIL.test(valor.trim()) ||
        "Informe um e-mail valido, como voce@exemplo.com."
      );
    },
    senha: function (valor) {
      return valor.length >= 8 || "A senha precisa ter ao menos 8 caracteres.";
    },
    senhaForte: function (valor) {
      if (valor.length < 8) return "A senha precisa ter ao menos 8 caracteres.";
      if (!/[A-Za-z]/.test(valor) || !/\d/.test(valor))
        return "Use pelo menos uma letra e um numero.";
      return true;
    },
    confirmacao: function (valor, input) {
      var outra = document.getElementById(input.getAttribute("data-match"));
      if (!outra) return true;
      return (
        (outra.value && valor === outra.value) || "As senhas nao sao iguais."
      );
    },
    perfil: function (valor) {
      return !!valor || "Escolha seu perfil para continuar.";
    },
    termos: function (valor, input) {
      return input.checked || "Voce precisa aceitar os termos de uso.";
    },
  };

  function marcarErro(input, mensagem) {
    var campo = input.closest ? input.closest(".field") : null;
    if (!campo) return;
    campo.classList.toggle("is-invalid", !!mensagem);
    var caixa = campo.querySelector(".field-error");
    if (caixa) caixa.textContent = mensagem || "";
    input.setAttribute("aria-invalid", mensagem ? "true" : "false");
  }

  function validar(input) {
    var regra = input.getAttribute("data-validate");
    if (!regra || !REGRAS[regra]) return true;
    var resultado = REGRAS[regra](input.value, input);
    marcarErro(input, resultado === true ? "" : resultado);
    return resultado === true;
  }

  function avisar(texto, tom) {
    var caixa = document.querySelector("[data-auth-status]");
    if (!caixa) return;
    caixa.textContent = texto;
    caixa.setAttribute("data-tone", tom || "info");
    caixa.classList.add("is-visible");
  }

  function valor(form, nome) {
    var el = form.querySelector('[name="' + nome + '"]');
    return el ? el.value.trim() : "";
  }

  function marcado(form, nome) {
    var el = form.querySelector('[name="' + nome + '"]');
    return el ? !!el.checked : false;
  }

  function coletarDados(form) {
    var interesses = [];
    todos('[name="interesses"]', form).forEach(function (el) {
      if (el.checked) interesses.push(el.value);
    });
    return {
      nome: valor(form, "nome"),
      email: valor(form, "email"),
      senha: valor(form, "senha"),
      perfil: valor(form, "perfil"),
      cidade: valor(form, "cidade"),
      interesses: interesses,
      newsletter: marcado(form, "newsletter"),
      lembrar: marcado(form, "lembrar"),
    };
  }

  function prepararFormulario() {
    var form = document.querySelector("[data-auth-form]");
    if (!form) return;
    var tipo = form.getAttribute("data-auth-form");
    var botao = form.querySelector("[data-auth-submit]");
    var campos = todos("[data-validate]", form);

    campos.forEach(function (input) {
      input.setAttribute("aria-invalid", "false");
      input.addEventListener("blur", function () {
        validar(input);
      });
      input.addEventListener("input", function () {
        var campo = input.closest ? input.closest(".field") : null;
        if (campo && campo.classList.contains("is-invalid")) validar(input);
      });
    });

    var confirmacao = form.querySelector("[data-match]");
    if (confirmacao) {
      confirmacao.addEventListener("input", function () {
        validar(confirmacao);
        var outra = document.getElementById(
          confirmacao.getAttribute("data-match"),
        );
        if (outra) validar(outra);
      });
    }

    form.addEventListener("submit", function (evento) {
      evento.preventDefault();
      var primeiroErro = null;
      campos.forEach(function (input) {
        if (!validar(input) && !primeiroErro) primeiroErro = input;
      });

      if (primeiroErro) {
        avisar("Revise os campos destacados antes de continuar.", "error");
        primeiroErro.focus();
        return;
      }

      if (botao) botao.setAttribute("aria-busy", "true");

      var dados = { tipo: tipo, dados: coletarDados(form) };
      if (window.RaizAuth && typeof window.RaizAuth.onSubmit === "function") {
        window.RaizAuth.onSubmit(dados);
        return;
      }

      avisar(
        "Formulario valido, mas nenhum servico de autenticacao esta conectado a esta " +
          "pagina. Configure o Firebase em firebase-config.js para o login funcionar.",
        "info",
      );
      if (botao) botao.removeAttribute("aria-busy");
    });
  }

  function prepararSenha() {
    todos("[data-pwd-toggle]").forEach(function (botao) {
      botao.addEventListener("click", function () {
        var input = document.getElementById(
          botao.getAttribute("data-pwd-toggle"),
        );
        if (!input) return;
        var visivel = input.type === "text";
        input.type = visivel ? "password" : "text";
        botao.textContent = visivel ? "Mostrar" : "Ocultar";
        botao.setAttribute(
          "aria-label",
          (visivel ? "Mostrar" : "Ocultar") + " senha",
        );
        input.focus();
      });
    });

    var medidor = document.querySelector("[data-meter-for]");
    if (!medidor) return;
    var input = document.getElementById(medidor.getAttribute("data-meter-for"));
    if (!input) return;
    var rotulo = medidor.querySelector(".meter-label");

    function atualizar() {
      var nivel = forcaSenha(input.value);
      medidor.setAttribute("data-level", String(nivel));
      if (rotulo) rotulo.textContent = input.value ? ROTULOS[nivel] : MINIMO;
    }

    input.addEventListener("input", atualizar);
    atualizar();
  }

  function prepararSocial() {
    todos("[data-sso]").forEach(function (botao) {
      botao.addEventListener("click", function () {
        var nome = botao.getAttribute("data-sso");
        if (window.RaizAuth && typeof window.RaizAuth.onSso === "function") {
          window.RaizAuth.onSso(nome);
          return;
        }
        avisar(
          "O login com " +
            nome +
            " precisa de um servico de autenticacao conectado " +
            "a esta pagina. Configure o Firebase em firebase-config.js.",
          "info",
        );
      });
    });
  }

  function iniciar() {
    prepararFormulario();
    prepararSenha();
    prepararSocial();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", iniciar);
  } else {
    iniciar();
  }
})();
