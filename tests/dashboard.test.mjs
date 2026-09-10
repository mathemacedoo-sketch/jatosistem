import test from "node:test";
import assert from "node:assert/strict";
import { resumoDashboard } from "../src/lib/dashboard.js";

test("dashboard separa vendas concluídas, rascunhos e lançamentos financeiros", () => {
  const db = { ordens: [
    { data: "2026-01-02", statusOS: "concluido", total: 100, clienteId: "a" },
    { data: "2026-01-03", statusOS: "concluido", total: 50, clienteId: "a" },
    { data: "2026-01-03", statusOS: "pendente", total: 70 },
    { data: "2026-01-03", statusOS: "estornado", total: 80 },
    { data: "2026-01-03", statusOS: "concluido", total: 900, lancamentoManual: true },
    { data: "2025-12-03", statusOS: "concluido", total: 30 },
  ], orcamentos: [{ data: "2026-01-01", pedidoId: "p" }, { data: "2026-01-02" }, { data: "2025-12-01" }] };
  const result = resumoDashboard(db, "2026-01", "2026-01-10");
  assert.equal(result.totalVendas, 150);
  assert.equal(result.ticketMedio, 75);
  assert.equal(result.clientesAtendidos, 1);
  assert.equal(result.valorAberto, 70);
  assert.equal(result.conversao, 50);
  assert.deepEqual(result.evolucao.slice(-2), [{ mes: "2025-12", total: 30 }, { mes: "2026-01", total: 150 }]);
});

test("financeiro mostra saldo parcial e diferencia vencidos dos vencimentos de hoje", () => {
  const db = { contasPagar: [{ valor: 100, valorPago: 40, vencimento: "2026-01-01" }, { valor: 50, vencimento: "2026-01-10" }, { valor: 80, status: "pago" }], produtos: [{ id: "p", quantidade: 2, estoqueMinimo: 3 }] };
  const result = resumoDashboard(db, "2025-12", "2026-01-10", [{ valorParcela: 100, valorPago: 30, dataVencimento: "2026-01-01" }, { valorParcela: 20, dataVencimento: "2026-01-10" }, { valorParcela: 90, statusPagamento: "pago" }]);
  assert.equal(result.aReceber, 90);
  assert.equal(result.receberVencido, 70);
  assert.equal(result.receberHoje, 20);
  assert.equal(result.aPagar, 110);
  assert.equal(result.pagarVencido, 60);
  assert.equal(result.pagarHoje, 50);
  assert.equal(result.estoqueBaixo.length, 1);
  assert.equal(result.ticketMedio, 0);
  assert.equal(result.conversao, 0);
});
