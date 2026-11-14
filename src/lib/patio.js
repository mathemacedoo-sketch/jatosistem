export const ETAPAS_PATIO = [
  { id: "aguardando", nome: "Aguardando" },
  { id: "lavagem", nome: "Em lavagem" },
  { id: "acabamento", nome: "Acabamento" },
  { id: "pronto", nome: "Pronto" },
];

export function ordensAtivasPatio(ordens = []) {
  return ordens.filter((ordem) =>
    !ordem.lancamentoManual && (!ordem.statusOS || ordem.statusOS === "pendente")
  );
}

export function etapaPatio(ordem) {
  return ETAPAS_PATIO.some((etapa) => etapa.id === ordem.statusPatio)
    ? ordem.statusPatio
    : "aguardando";
}

export function linkWhatsappPatio(ordem, cliente) {
  const numero = String(cliente?.telefone || "").replace(/\D/g, "");
  const telefone = numero.startsWith("55") ? numero : `55${numero}`;
  if (!/^\d{12,13}$/.test(telefone)) return "";
  const mensagem = "seu carro está lavado e te aguardando. Estamos no seu aguardo :)";
  return `https://wa.me/${telefone}?text=${encodeURIComponent(mensagem)}`;
}

export function resumoPatio(ordens = [], hoje) {
  const ativas = ordensAtivasPatio(ordens);
  const carrosHoje = ordens.filter((ordem) =>
    !ordem.lancamentoManual
    && !["rascunho", "estornado"].includes(ordem.statusOS)
    && String(ordem.data || "").startsWith(hoje)
  );
  const concluidasHoje = ordens.filter((ordem) =>
    !ordem.lancamentoManual
    && ordem.statusOS === "concluido"
    && String(ordem.data || "").startsWith(hoje)
  );
  const duracoes = ordens
    .filter((ordem) =>
      etapaPatio(ordem) === "pronto"
      && String(ordem.patioProntoEm || "").startsWith(hoje)
      && ordem.patioInicioEm
      && ordem.patioProntoEm
    )
    .map((ordem) => (new Date(ordem.patioProntoEm) - new Date(ordem.patioInicioEm)) / 60000)
    .filter((minutos) => Number.isFinite(minutos) && minutos >= 0);

  return {
    carrosHoje: carrosHoje.length,
    emLavagem: ativas.filter((ordem) => etapaPatio(ordem) === "lavagem").length,
    faturamentoHoje: Math.round(concluidasHoje.reduce((total, ordem) => total + (Number(ordem.total) || 0), 0) * 100) / 100,
    tempoMedioMinutos: duracoes.length
      ? Math.round(duracoes.reduce((total, minutos) => total + minutos, 0) / duracoes.length)
      : null,
  };
}
