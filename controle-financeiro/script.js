(function () {
  const STORAGE_KEY = 'controle-financeiro-transacoes';
  const COMPROVANTE_MAX_BYTES = 2 * 1024 * 1024; // 2 MB
  const COMPROVANTE_TIPOS = ['image/png', 'image/jpeg', 'image/jpg', 'application/pdf'];

  let transacoes = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  let filtroAtual = 'todos';
  let idEditando = null;
  let comprovantePendente = null;
  let removerComprovanteNaEdicao = false;

  const form = document.getElementById('form-transacao');
  const lista = document.getElementById('lista-transacoes');
  const listaVazia = document.getElementById('lista-vazia');
  const saldoTotal = document.getElementById('saldo-total');
  const totalReceitas = document.getElementById('total-receitas');
  const totalDespesas = document.getElementById('total-despesas');
  const formTitulo = document.getElementById('form-titulo');
  const btnSubmit = document.getElementById('btn-submit');
  const btnCancelar = document.getElementById('btn-cancelar');
  const inputComprovante = document.getElementById('comprovante');
  const comprovantePreview = document.getElementById('comprovante-preview');
  const btnRemoverComprovante = document.getElementById('btn-remover-comprovante');

  function formatarMoeda(valor) {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(valor);
  }

  function formatarData(str) {
    const [y, m, d] = str.split('-');
    return `${d}/${m}/${y}`;
  }

  function obterId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2);
  }

  function calcularTotais() {
    const receitas = transacoes
      .filter(t => t.tipo === 'receita')
      .reduce((acc, t) => acc + t.valor, 0);
    const despesas = transacoes
      .filter(t => t.tipo === 'despesa')
      .reduce((acc, t) => acc + t.valor, 0);
    const saldo = receitas - despesas;

    totalReceitas.textContent = formatarMoeda(receitas);
    totalDespesas.textContent = formatarMoeda(despesas);
    saldoTotal.textContent = formatarMoeda(saldo);
    saldoTotal.className = 'card-valor ' + (saldo >= 0 ? 'positivo' : 'negativo');
  }

  function filtrarTransacoes() {
    if (filtroAtual === 'todos') return transacoes;
    return transacoes.filter(t => t.tipo === filtroAtual);
  }

  function renderizarLista() {
    const filtradas = filtrarTransacoes();
    lista.innerHTML = '';

    if (filtradas.length === 0) {
      listaVazia.classList.remove('oculto');
      return;
    }
    listaVazia.classList.add('oculto');

    filtradas.forEach(t => {
      const li = document.createElement('li');
      li.dataset.id = t.id;
      const comprovanteHtml = t.comprovante
        ? `<button type="button" class="btn-ver-comprovante" title="Ver comprovante" aria-label="Ver comprovante">📎 ${t.comprovante.nome}</button>`
        : '';
      li.innerHTML = `
        <div class="transacao-info">
          <span class="transacao-descricao">${escapeHtml(t.descricao)}</span>
          <span class="transacao-data">${formatarData(t.data)}</span>
          ${comprovanteHtml ? `<div class="transacao-comprovante">${comprovanteHtml}</div>` : ''}
        </div>
        <span class="transacao-valor ${t.tipo}">${t.tipo === 'receita' ? '+' : '-'} ${formatarMoeda(t.valor)}</span>
        <div class="transacao-acoes">
          <button type="button" class="btn-editar" title="Editar" aria-label="Editar transação">✎</button>
          <button type="button" class="btn-excluir" title="Excluir" aria-label="Excluir transação">✕</button>
        </div>
      `;
      li.querySelector('.btn-editar').addEventListener('click', () => iniciarEdicao(t.id));
      li.querySelector('.btn-excluir').addEventListener('click', () => excluirTransacao(t.id));
      const btnVer = li.querySelector('.btn-ver-comprovante');
      if (btnVer && t.comprovante) {
        btnVer.addEventListener('click', () => abrirComprovanteEmNovaAba(t.comprovante));
      }
      lista.appendChild(li);
    });
  }

  function escapeHtml(texto) {
    const div = document.createElement('div');
    div.textContent = texto;
    return div.innerHTML;
  }

  function abrirComprovanteEmNovaAba(comprovante) {
    try {
      const base64 = comprovante.data.split(',')[1];
      if (!base64) return;
      const byteChars = atob(base64);
      const byteNumbers = new Array(byteChars.length);
      for (let i = 0; i < byteChars.length; i++) {
        byteNumbers[i] = byteChars.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: comprovante.tipo });
      const url = URL.createObjectURL(blob);
      const w = window.open(url, '_blank');
      if (w) setTimeout(() => URL.revokeObjectURL(url), 60000);
      else URL.revokeObjectURL(url);
    } catch (e) {
      window.open(comprovante.data, '_blank');
    }
  }

  function exibirPreviewComprovante(comprovante, ehExistente) {
    comprovantePreview.innerHTML = '';
    comprovantePreview.classList.remove('oculto');
    const isPdf = comprovante.tipo === 'application/pdf';
    if (isPdf) {
      comprovantePreview.innerHTML = `<span class="comprovante-icon comprovante-pdf">📄</span><span class="comprovante-nome">${escapeHtml(comprovante.nome)}</span>`;
    } else {
      const img = document.createElement('img');
      img.src = comprovante.data;
      img.alt = comprovante.nome;
      img.className = 'comprovante-thumb';
      comprovantePreview.appendChild(img);
      const nome = document.createElement('span');
      nome.className = 'comprovante-nome';
      nome.textContent = comprovante.nome;
      comprovantePreview.appendChild(nome);
    }
    if (ehExistente) btnRemoverComprovante.classList.remove('oculto');
  }

  function limparPreviewComprovante() {
    comprovantePendente = null;
    removerComprovanteNaEdicao = false;
    comprovantePreview.innerHTML = '';
    comprovantePreview.classList.add('oculto');
    btnRemoverComprovante.classList.add('oculto');
    if (inputComprovante) inputComprovante.value = '';
  }

  function salvarNoStorage() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(transacoes));
  }

  function adicionarTransacao(dados) {
    const transacao = {
      id: obterId(),
      descricao: dados.descricao.trim(),
      valor: Math.abs(Number(dados.valor)),
      tipo: dados.tipo,
      data: dados.data
    };
    if (dados.comprovante) {
      transacao.comprovante = { nome: dados.comprovante.nome, tipo: dados.comprovante.tipo, data: dados.comprovante.data };
    }
    transacoes.push(transacao);
    salvarNoStorage();
    calcularTotais();
    renderizarLista();
  }

  function excluirTransacao(id) {
    transacoes = transacoes.filter(t => t.id !== id);
    salvarNoStorage();
    calcularTotais();
    renderizarLista();
    if (idEditando === id) cancelarEdicao();
  }

  function atualizarTransacao(id, dados) {
    const index = transacoes.findIndex(t => t.id === id);
    if (index === -1) return;
    const atual = {
      id,
      descricao: dados.descricao.trim(),
      valor: Math.abs(Number(dados.valor)),
      tipo: dados.tipo,
      data: dados.data
    };
    if (dados.removerComprovante) {
      atual.comprovante = undefined;
    } else if (dados.comprovante) {
      atual.comprovante = { nome: dados.comprovante.nome, tipo: dados.comprovante.tipo, data: dados.comprovante.data };
    } else if (transacoes[index].comprovante) {
      atual.comprovante = transacoes[index].comprovante;
    }
    transacoes[index] = atual;
    salvarNoStorage();
    calcularTotais();
    renderizarLista();
  }

  function iniciarEdicao(id) {
    const t = transacoes.find(tr => tr.id === id);
    if (!t) return;
    idEditando = id;
    comprovantePendente = null;
    removerComprovanteNaEdicao = false;
    document.getElementById('descricao').value = t.descricao;
    document.getElementById('valor').value = t.valor;
    form.querySelector(`input[name="tipo"][value="${t.tipo}"]`).checked = true;
    document.getElementById('data').value = t.data;
    inputComprovante.value = '';
    if (t.comprovante) {
      exibirPreviewComprovante(t.comprovante, true);
    } else {
      limparPreviewComprovante();
    }
    formTitulo.textContent = 'Editar transação';
    btnSubmit.textContent = 'Salvar alterações';
    btnCancelar.classList.remove('oculto');
    document.querySelector('.formulario-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function cancelarEdicao() {
    idEditando = null;
    form.reset();
    definirDataHoje();
    limparPreviewComprovante();
    formTitulo.textContent = 'Nova transação';
    btnSubmit.textContent = 'Adicionar';
    btnCancelar.classList.add('oculto');
    document.getElementById('descricao').focus();
  }

  function definirDataHoje() {
    const inputData = document.getElementById('data');
    const hoje = new Date().toISOString().slice(0, 10);
    inputData.value = hoje;
  }

  inputComprovante.addEventListener('change', function () {
    const file = this.files && this.files[0];
    if (!file) return;
    if (!COMPROVANTE_TIPOS.includes(file.type)) {
      alert('Formato não permitido. Use PNG, JPEG ou PDF.');
      this.value = '';
      return;
    }
    if (file.size > COMPROVANTE_MAX_BYTES) {
      alert('Arquivo muito grande. Tamanho máximo: 2 MB.');
      this.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = function () {
      comprovantePendente = { nome: file.name, tipo: file.type, data: reader.result };
      removerComprovanteNaEdicao = false;
      exibirPreviewComprovante(comprovantePendente, false);
      btnRemoverComprovante.classList.remove('oculto');
    };
    reader.readAsDataURL(file);
  });

  btnRemoverComprovante.addEventListener('click', function () {
    if (idEditando) {
      removerComprovanteNaEdicao = true;
      comprovantePendente = null;
      comprovantePreview.innerHTML = '';
      comprovantePreview.classList.add('oculto');
      btnRemoverComprovante.classList.add('oculto');
      inputComprovante.value = '';
    } else {
      limparPreviewComprovante();
    }
  });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    const descricao = document.getElementById('descricao').value;
    const valor = document.getElementById('valor').value;
    const tipo = form.querySelector('input[name="tipo"]:checked').value;
    const data = document.getElementById('data').value;

    if (idEditando) {
      atualizarTransacao(idEditando, {
        descricao,
        valor,
        tipo,
        data,
        comprovante: comprovantePendente || undefined,
        removerComprovante: removerComprovanteNaEdicao
      });
      cancelarEdicao();
    } else {
      adicionarTransacao({ descricao, valor, tipo, data, comprovante: comprovantePendente || undefined });
      form.reset();
      definirDataHoje();
      limparPreviewComprovante();
      document.getElementById('descricao').focus();
    }
  });

  btnCancelar.addEventListener('click', cancelarEdicao);

  document.querySelectorAll('.btn-filtro').forEach(btn => {
    btn.addEventListener('click', function () {
      document.querySelector('.btn-filtro.ativo').classList.remove('ativo');
      this.classList.add('ativo');
      filtroAtual = this.dataset.filtro;
      renderizarLista();
    });
  });

  /* ===== Abas (Transações / Gráfico) ===== */
  const MESES_NOMES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  let chartInstance = null;

  function obterDadosPorMes(ultimosMeses) {
    const hoje = new Date();
    const resultado = [];
    for (let i = ultimosMeses - 1; i >= 0; i--) {
      const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
      const ano = d.getFullYear();
      const mes = String(d.getMonth() + 1).padStart(2, '0');
      const chave = ano + '-' + mes;
      const receita = transacoes
        .filter(t => t.tipo === 'receita' && t.data && t.data.startsWith(chave))
        .reduce((acc, t) => acc + t.valor, 0);
      const despesa = transacoes
        .filter(t => t.tipo === 'despesa' && t.data && t.data.startsWith(chave))
        .reduce((acc, t) => acc + t.valor, 0);
      resultado.push({
        label: MESES_NOMES[d.getMonth()] + '/' + ano,
        receita,
        despesa
      });
    }
    return resultado;
  }

  function atualizarGrafico() {
    if (typeof Chart === 'undefined') return;
    const canvas = document.getElementById('chart-receita-despesa');
    if (!canvas) return;
    if (chartInstance) {
      chartInstance.destroy();
      chartInstance = null;
    }
    const dados = obterDadosPorMes(12);
    const labels = dados.map(d => d.label);
    const receitas = dados.map(d => d.receita);
    const despesas = dados.map(d => d.despesa);

    chartInstance = new Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Receitas',
            data: receitas,
            backgroundColor: 'rgba(34, 197, 94, 0.7)',
            borderColor: 'rgb(34, 197, 94)',
            borderWidth: 1
          },
          {
            label: 'Despesas',
            data: despesas,
            backgroundColor: 'rgba(239, 68, 68, 0.7)',
            borderColor: 'rgb(239, 68, 68)',
            borderWidth: 1
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: {
            position: 'top',
            labels: { color: '#a0a0b0' }
          }
        },
        scales: {
          x: {
            ticks: { color: '#a0a0b0', maxRotation: 45 },
            grid: { color: 'rgba(255,255,255,0.06)' }
          },
          y: {
            beginAtZero: true,
            ticks: {
              color: '#a0a0b0',
              callback: function (value) {
                return 'R$ ' + value.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
              }
            },
            grid: { color: 'rgba(255,255,255,0.06)' }
          }
        }
      }
    });
  }

  document.querySelectorAll('.nav-aba').forEach(btn => {
    btn.addEventListener('click', function () {
      const aba = this.dataset.aba;
      document.querySelectorAll('.nav-aba').forEach(b => b.classList.remove('ativo'));
      document.querySelectorAll('.aba-conteudo').forEach(el => el.classList.remove('ativo'));
      this.classList.add('ativo');
      const painel = document.getElementById('aba-' + aba);
      if (painel) painel.classList.add('ativo');
      if (aba === 'grafico') atualizarGrafico();
    });
  });

  definirDataHoje();
  calcularTotais();
  renderizarLista();
})();
