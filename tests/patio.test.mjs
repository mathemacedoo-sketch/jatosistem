import test from "node:test";
import assert from "node:assert/strict";
import { etapaPatio, linkWhatsappPatio, ordensAtivasPatio, resumoPatio } from "../src/lib/patio.js";

test("quadro inclui apenas OS em andamento e assume Aguardando para OS legadas", () => {
  const ordens = [
    { id: "a", statusOS: "pendente", data: "2026-11-14" },
    { id: "b", statusOS: "concluido", data: "2026-11-14" },
    { id: "c", statusOS: "rascunho", data: "2026-11-14" },
    { id: "d", statusOS: "pendente", lancamentoManual: true },
    { id: "e", data: "2026-11-14" },
  ];

  assert.deepEqual(ordensAtivasPatio(ordens).map((ordem) => ordem.id), ["a", "e"]);
  assert.equal(etapaPatio(ordens[0]), "aguardando");
  assert.equal(etapaPatio({ statusPatio: "invalida" }), "aguardando");
});

test("resumo conta OS do dia e calcula faturamento e duração sem alterar status financeiro", () => {
  const ordens = [
    { statusOS: "pendente", statusPatio: "lavagem", data: "2026-11-14", total: 40 },
    { statusOS: "pendente", statusPatio: "pronto", data: "2026-11-14", patioInicioEm: "2026-11-14T10:00:00Z", patioProntoEm: "2026-11-14T10:38:00Z" },
    { statusOS: "concluido", data: "2026-11-14", total: 1240 },
    { statusOS: "concluido", data: "2026-11-14", total: 900, lancamentoManual: true },
    { statusOS: "pendente", data: "2026-11-13", total: 80 },
  ];

  assert.deepEqual(resumoPatio(ordens, "2026-11-14"), {
    carrosHoje: 3,
    emLavagem: 1,
    faturamentoHoje: 1240,
    tempoMedioMinutos: 38,
  });
  assert.equal(ordens[1].statusOS, "pendente");
});

test("aviso de WhatsApp usa telefone brasileiro e mensagem pronta, sem inventar destinatário", () => {
  const link = linkWhatsappPatio({ numero: "0012", clienteNome: "Cliente" }, { nome: "Ana", telefone: "(11) 99999-0000" });
  const url = new URL(link);

  assert.equal(url.host, "wa.me");
  assert.equal(url.pathname, "/5511999990000");
  assert.equal(url.searchParams.get("text"), "seu carro está lavado e te aguardando. Estamos no seu aguardo :)");
  assert.equal(linkWhatsappPatio({ numero: "0012" }, { nome: "Ana", telefone: "" }), "");
});
