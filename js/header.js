(function (global) {
  'use strict';

  function el(tag, atributos, filhos) {
    var node = document.createElement(tag);
    if (atributos) {
      Object.keys(atributos).forEach(function (chave) {
        if (chave === 'texto') node.textContent = atributos[chave];
        else if (chave === 'classe') node.className = atributos[chave];
        else node.setAttribute(chave, atributos[chave]);
      });
    }
    (filhos || []).forEach(function (filho) { node.appendChild(filho); });
    return node;
  }

  function caixa() {
    return document.querySelector('[data-account]');
  }

  function iniciais(nome) {
    var partes = String(nome || '').trim().split(/\s+/).filter(Boolean);
    if (!partes.length) return '?';
    if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
    return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
  }

  function corDe(texto) {
    var base = String(texto || '');
    var soma = 0;
    for (var i = 0; i < base.length; i++) soma = (soma * 31 + base.charCodeAt(i)) % 360;
    return 'hsl(' + soma + ', 42%, 42%)';
  }

  function nomeDe(usuario) {
    if (!usuario) return '';
    if (usuario.displayName) return usuario.displayName;
    if (usuario.email) return usuario.email.split('@')[0];
    return 'Visitante';
  }


  var inPagesDir = window.location.pathname.indexOf('/pages/') !== -1;
  function pageLink(file) {
    return inPagesDir ? file : 'pages/' + file;
  }

  function estadoDeslogado(container) {
    container.textContent = '';
    container.appendChild(el('div', { classe: 'account-out' }, [
      el('a', { classe: 'account-link account-link-signup', href: pageLink('cadastro.html'), texto: 'Criar conta' }),
      el('a', { classe: 'account-link account-link-login', href: pageLink('login.html'), texto: 'Entrar' })
    ]));
  }


  function estadoLogado(container, usuario) {
    var nome = nomeDe(usuario);
    var foto = usuario.photoURL;

    var avatar;
    if (foto) {
      avatar = el('img', {
        classe: 'account-avatar',
        src: foto,
        alt: 'Foto de ' + nome,
        width: '32',
        height: '32',
        referrerpolicy: 'no-referrer',
        loading: 'lazy'
      });
      avatar.addEventListener('error', function () {
        avatar.parentNode.replaceChild(circuloIniciais(nome), avatar);
      });
    } else {
      avatar = circuloIniciais(nome);
    }

    var menu = el('div', { classe: 'account-menu', role: 'menu', hidden: 'hidden' }, [
      el('div', { classe: 'account-menu-head' }, [
        el('strong', { texto: nome }),
        el('span', { texto: usuario.email || '' })
      ]),
      el('a', {
        classe: 'account-menu-item',
        href: pageLink('perfil.html'),
        role: 'menuitem',
        texto: 'Meu perfil'
      }),
      el('a', {
        classe: 'account-menu-item',
        href: pageLink('conteudo-1.html'),
        role: 'menuitem',
        texto: 'Ir para o conteudo'
      }),
      el('button', {
        classe: 'account-menu-item account-menu-item-sair',
        type: 'button',
        role: 'menuitem',
        'data-sair': 'true',
        texto: 'Sair'
      })
    ]);

    menu.hidden = true;

    var botao = el('button', {
      classe: 'account-toggle',
      type: 'button',
      'aria-expanded': 'false',
      'aria-haspopup': 'true'
    }, [avatar, el('span', { classe: 'account-name', texto: nome })]);

    var involve = el('div', { classe: 'account-in' }, [botao, menu]);

    function fechar() {
      menu.hidden = true;
      botao.setAttribute('aria-expanded', 'false');
    }

    botao.addEventListener('click', function () {
      var aberto = menu.hidden;
      menu.hidden = !aberto;
      botao.setAttribute('aria-expanded', aberto ? 'true' : 'false');
    });

    document.addEventListener('click', function (evento) {
      if (!involve.contains(evento.target)) fechar();
    });

    document.addEventListener('keydown', function (evento) {
      if (evento.key === 'Escape') fechar();
    });

    var botaoSair = menu.querySelector('[data-sair]');
    if (botaoSair) {
      botaoSair.addEventListener('click', function () {
        fechar();
        if (typeof aoSair === 'function') aoSair();
      });
    }

    container.textContent = '';
    container.appendChild(involve);
  }

  function circuloIniciais(nome) {
    return el('span', {
      classe: 'account-initials',
      style: 'background:' + corDe(nome),
      'aria-hidden': 'true',
      texto: iniciais(nome)
    });
  }


  var alvo = null;
  var aoSair = null;

  function render(usuario) {
    if (!alvo) alvo = caixa();
    if (!alvo) return;
    if (usuario) estadoLogado(alvo, usuario);
    else estadoDeslogado(alvo);
  }

  function iniciar() {
    alvo = caixa();
    if (!alvo) return;
    render(null);
  }

  global.RaizHeader = {
    render: render,
    definirSair: function (funcao) { aoSair = funcao; },
    iniciais: iniciais,
    corDe: corDe
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciar);
  } else {
    iniciar();
  }
})(window);
