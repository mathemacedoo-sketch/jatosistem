import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { calcularItem, carregarPagamentos, dinheiro, filtrarItensValidos, financeiroPedido, gerarParcelasPagamento, normalizarBuscaTexto, sincronizarParcelas, somarItens, validarPagamentos, vencimentoMensal } from "../src/lib/pedido.js";

const pagamento = (dados = {}) => {
  const registro = { id: "pg1", tipoPagamento: "prazo", qtdParcelas: 3, formaPagamento: "Boleto", valor: 100, ...dados };
  return { ...registro, parcelas: gerarParcelasPagamento(registro, "2026-01-31") };
};

test("descontos por linha e geral compõem o total sem perder centavos", () => {
  assert.equal(calcularItem({ qtd: 3, precoUnit: 19.9, desconto: 4.7 }).subtotal, 55);
  assert.deepEqual(somarItens([
    { descricao: "Item A", qtd: 3, precoUnit: 19.9, desconto: 4.7 },
    { descricao: "Item B", qtd: 0.5, precoUnit: 40 },
  ], 5), { subtotal: 75, desconto: 5, total: 70 });
});

test("linhas vazias são ignoradas e não contam como item válido", () => {
  const itens = [
    { uidLine: "blank", itemId: null, tipo: "manual", codigo: "", descricao: "", nome: "", qtd: 1, precoUnit: "", desconto: 0 },
    { uidLine: "ok", itemId: 5, tipo: "servico", codigo: "SER-1", descricao: "Lavagem completa", nome: "Lavagem completa", qtd: 2, precoUnit: 30, desconto: 0 },
  ];
  assert.deepEqual(filtrarItensValidos(itens), [itens[1]]);
  assert.deepEqual(somarItens(itens), { subtotal: 60, desconto: 0, total: 60 });
});

test("a busca normaliza data, número e nome para encontrar pedidos", () => {
  assert.equal(normalizarBuscaTexto("10/09/2026"), "10092026");
  assert.equal(normalizarBuscaTexto("José da Silva"), "jose da silva");
  assert.equal(normalizarBuscaTexto("#001"), "001");
});

test("a pesquisa inclui pedidos concluidos e busca pelo cliente relacionado", () => {
  const db = { clientes: [{ id: "c1", nome: "Matheus", cpfCnpj: "12345678900" }], ordens: [{ id: "o1", clienteId: "c1", clienteNome: "", statusOS: "concluido", numero: "001", data: "2026-09-10", clienteSnapshot: { nome: "Matheus" } }] };
  const pedidos = (db.ordens || []).filter((ordem) => !ordem.lancamentoManual);
  const termo = normalizarBuscaTexto("matheus");
  const encontrar = pedidos.filter((ordem) => {
    const clienteSalvo = ordem.clienteNome || ordem.clienteSnapshot?.nome || "";
    const clienteRelacionado = (db.clientes || []).find((cliente) => String(cliente.id) === String(ordem.clienteId));
    const numero = normalizarBuscaTexto(ordem.numero || "");
    const cliente = normalizarBuscaTexto(clienteSalvo || clienteRelacionado?.nome || "");
    const documento = normalizarBuscaTexto(ordem.clienteSnapshot?.cpfCnpj || clienteRelacionado?.cpfCnpj || "");
    return [numero, cliente, documento].some((valor) => valor.includes(termo));
  });
  assert.equal(encontrar.length, 1);
});

test("parcelas fecham o total e respeitam o último dia de cada mês", () => {
  const parcelas = pagamento().parcelas;
  assert.deepEqual(parcelas.map((item) => item.valor), [33.34, 33.33, 33.33]);
  assert.deepEqual(parcelas.map((item) => item.dataVencimento), ["2026-01-31", "2026-02-28", "2026-03-31"]);
  assert.equal(vencimentoMensal("2028-01-31", 1), "2028-02-29");
  assert.equal(dinheiro(parcelas.reduce((soma, item) => soma + item.valor, 0)), 100);
});

test("editar valor ou condição mantém os vencimentos personalizados", () => {
  const registro = pagamento();
  registro.parcelas[1].dataVencimento = "2026-03-12";
  const parcelas = gerarParcelasPagamento({ ...registro, valor: 200, qtdParcelas: 4 }, "2026-01-31", registro.parcelas);
  assert.equal(parcelas[1].dataVencimento, "2026-03-12");
  assert.equal(parcelas.length, 4);
  assert.equal(parcelas[3].dataVencimento, "2026-04-30");
});

test("pagamento misto liquida somente a parte à vista na conclusão", () => {
  const pagamentos = [pagamento({ id: "pix", tipoPagamento: "avista", formaPagamento: "Pix", valor: 40 }), pagamento({ valor: 60 })];
  const rascunho = financeiroPedido(pagamentos, false, "2026-01-31");
  assert.equal(rascunho.valorPago, 0);
  assert.ok(rascunho.parcelas.every((item) => item.status === "pendente"));
  const concluido = financeiroPedido(pagamentos, true, "2026-01-31");
  assert.equal(concluido.valorPago, 40);
  assert.equal(concluido.statusPagamento, "parcial");
  assert.equal(concluido.parcelas[0].formaPagamentoBaixa, "Pix");
  assert.equal(concluido.parcelas[0].dataBaixa, "2026-01-31");
  assert.ok(concluido.parcelas.slice(1).every((item) => item.status === "pendente"));
  assert.equal(validarPagamentos(pagamentos, 100, true), "");
  assert.ok(validarPagamentos(pagamentos, 105, true));
  assert.ok(validarPagamentos([], 100, true));
  assert.equal(validarPagamentos([], 100, false), "");
});

test("reabrir pedidos legados preserva parcelas e pedidos sem pagamento permanecem vazios", () => {
  const parcelas = pagamento().parcelas;
  const carregados = carregarPagamentos({ id: "antigo", total: 100, formaPagamento: "Carteira", parcelas }, "2026-01-31");
  assert.equal(carregados[0].tipoPagamento, "prazo");
  assert.deepEqual(carregados[0].parcelas, parcelas);
  assert.deepEqual(carregarPagamentos({ pagamentos: [] }, "2026-01-31"), []);
});

test("baixas e vencimentos do financeiro atualizam resumo e linhas do pedido", () => {
  const financeiro = financeiroPedido([pagamento()], true, "2026-01-31");
  financeiro.parcelas[0] = { ...financeiro.parcelas[0], status: "pago", valorPago: 33.34, dataVencimento: "2026-02-12" };
  const ordem = sincronizarParcelas({ ...financeiro, statusOS: "concluido" });
  assert.equal(ordem.valorPago, 33.34);
  assert.equal(ordem.statusPagamento, "parcial");
  assert.equal(ordem.pagamentos[0].parcelas[0].dataVencimento, "2026-02-12");
  assert.equal(ordem.pagamentos[0].parcelas[0].status, "pago");
});

test("salvamento conjunto mantém isolamento de empresa e exclusão libera o orçamento", () => {
  const source = fs.readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
  const body = source.slice(source.indexOf("  const update = (key, updater) => {"), source.indexOf("\n  const excluirEmpresa"));
  const original = { ordens: [{ id: "o1", empresaId: "a", origemOrcamentoId: "b1" }, { id: "o2", empresaId: "b" }], produtos: [{ id: "p1", empresaId: "a", quantidade: 10 }], orcamentos: [{ id: "b1", empresaId: "a", pedidoId: "o1", convertidoEm: "2026-01-31", status: "convertido" }, { id: "b2", empresaId: "b", pedidoId: "o2", status: "convertido" }] };
  const ref = { current: original };
  let persistencias = 0;
  const update = new Function("dbRef", "auth", "setDb", "persistSnapshot", "sincronizarParcelas", `${body}\nreturn update;`)(ref, { empresaId: "a" }, () => {}, () => { persistencias++; }, sincronizarParcelas);
  update({ ordens: () => [], produtos: (itens) => itens.map((item) => ({ ...item, quantidade: 9 })) });
  assert.equal(persistencias, 1);
  assert.deepEqual(ref.current.ordens, [original.ordens[1]]);
  assert.equal(ref.current.produtos[0].quantidade, 9);
  assert.equal(ref.current.orcamentos[0].status, "pendente");
  assert.equal(ref.current.orcamentos[0].pedidoId, null);
  assert.equal(ref.current.orcamentos[0].convertidoEm, null);
  assert.deepEqual(ref.current.orcamentos[1], original.orcamentos[1]);
});
