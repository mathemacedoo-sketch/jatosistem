import { supabase } from "./supabase";

const COLLECTIONS = [
  "empresas",
  "usuarios",
  "funcionarios",
  "servicos",
  "produtos",
  "ordens",
  "contasPagar",
  "contatosRetorno",
];
const TENANT_COLLECTIONS = COLLECTIONS.filter((collection) => collection !== "empresas");

const assertTenantIntegrity = (database) => {
  for (const collection of TENANT_COLLECTIONS) {
    for (const item of database[collection] || []) {
      if (!item?.empresaId) {
        throw new Error(`Registro de ${collection} sem empresa. Salvamento bloqueado para evitar mistura de dados.`);
      }
    }
  }
};

const clienteFromRow = (row) => ({
  id: row.id,
  empresaId: row.empresa_id || "",
  codigo: row.codigo || "",
  tipoPessoa: row.tipo_pessoa || "fisica",
  nome: row.nome || "",
  cpfCnpj: row.cpf_cnpj || "",
  dataNascimento: row.data_nascimento || "",
  email: row.email || "",
  telefone: row.telefone || "",
  cep: row.cep || "",
  endereco: row.endereco || "",
  numero: row.numero || "",
  bairro: row.bairro || "",
  cidade: row.cidade || "",
  estado: row.estado || "",
  marca: row.marca || "",
  veiculo: row.veiculo || "",
  cor: row.cor || "",
  ano: row.ano || "",
  placa: row.placa || "",
  motorista: row.motorista || "",
});

const clienteToRow = (cliente) => ({
  id: cliente.id,
  empresa_id: cliente.empresaId || null,
  codigo: cliente.codigo || null,
  tipo_pessoa: cliente.tipoPessoa || "fisica",
  nome: cliente.nome,
  cpf_cnpj: cliente.cpfCnpj || null,
  data_nascimento: cliente.dataNascimento || null,
  email: cliente.email || null,
  telefone: cliente.telefone || null,
  cep: cliente.cep || null,
  endereco: cliente.endereco || null,
  numero: cliente.numero || null,
  bairro: cliente.bairro || null,
  cidade: cliente.cidade || null,
  estado: cliente.estado || null,
  marca: cliente.marca || null,
  veiculo: cliente.veiculo || null,
  cor: cliente.cor || null,
  ano: cliente.ano || null,
  placa: cliente.placa || null,
  motorista: cliente.motorista || null,
});

const throwIfError = (result, operation) => {
  if (result.error) {
    throw new Error(`${operation}: ${result.error.message}`);
  }
  return result.data || [];
};

export async function loadDatabase(seed) {
  const [clientesResult, recordsResult] = await Promise.all([
    supabase.from("clientes").select("*").is("dt_exc", null).order("id", { ascending: true }),
    supabase.from("sistema_registros").select("modulo, registro_id, empresa_id, dados").is("dt_exc", null),
  ]);

  const clientes = throwIfError(clientesResult, "Erro ao carregar clientes").map(clienteFromRow);
  const records = throwIfError(recordsResult, "Erro ao carregar dados do sistema");
  let masterPadrao = records.find(
    (row) => row.modulo === "usuarios" && row.registro_id === "usuario-admin"
  );

  if (!masterPadrao) {
    let empresaPadrao = records.find(
      (row) => row.modulo === "empresas" && row.dados?.nome === "ADM"
    ) || records.find((row) => row.modulo === "empresas");

    if (!empresaPadrao) {
      const empresa = seed.empresas[0];
      empresaPadrao = {
        modulo: "empresas",
        registro_id: String(empresa.id),
        empresa_id: null,
        dados: empresa,
        dt_exc: null,
      };
      throwIfError(
        await supabase
          .from("sistema_registros")
          .upsert(empresaPadrao, { onConflict: "modulo,registro_id" }),
        "Erro ao restaurar empresa administrativa"
      );
      records.push(empresaPadrao);
    }

    const usuario = {
      ...seed.usuarios[0],
      empresaId: empresaPadrao.registro_id,
      usuario: "admin",
      senha: "admin",
      perfil: "master",
    };
    masterPadrao = {
      modulo: "usuarios",
      registro_id: String(usuario.id),
      empresa_id: empresaPadrao.registro_id,
      dados: usuario,
      dt_exc: null,
    };
    throwIfError(
      await supabase
        .from("sistema_registros")
        .upsert(masterPadrao, { onConflict: "modulo,registro_id" }),
      "Erro ao restaurar usuário master"
    );
    records.push(masterPadrao);
  } else if (masterPadrao.dados?.senha !== "admin") {
    masterPadrao.dados = { ...masterPadrao.dados, senha: "admin" };
    throwIfError(
      await supabase
        .from("sistema_registros")
        .update({ dados: masterPadrao.dados })
        .eq("modulo", "usuarios")
        .eq("registro_id", masterPadrao.registro_id),
      "Erro ao atualizar senha do usuário master"
    );
  }
  const initialized = records.some((row) => row.modulo === "__meta__");
  const loaded = {
    ...seed,
    clientes,
  };

  COLLECTIONS.forEach((collection) => {
    const collectionRecords = records
      .filter((row) => row.modulo === collection)
      .map((row) => ({
        ...(row.dados || {}),
        id: row.registro_id,
        ...(row.empresa_id ? { empresaId: row.empresa_id } : {}),
      }));
    loaded[collection] = initialized ? collectionRecords : seed[collection];
  });

  return { database: loaded, initialized };
}

export async function createCliente(cliente) {
  if (!cliente?.empresaId) {
    throw new Error("Cadastro de cliente bloqueado: empresa nÃ£o informada.");
  }
  const row = clienteToRow(cliente);
  delete row.id;
  const result = await supabase.from("clientes").insert(row).select("*").single();
  return clienteFromRow(throwIfError(result, "Erro ao cadastrar cliente"));
}

const equal = (left, right) => JSON.stringify(left) === JSON.stringify(right);

export async function syncDatabase(previous, current) {
  assertTenantIntegrity(current);
  throwIfError(
    await supabase.from("sistema_registros").upsert({
      modulo: "__meta__",
      registro_id: "database",
      empresa_id: null,
      dados: { initialized: true, version: 1 },
    }, { onConflict: "modulo,registro_id" }),
    "Erro ao inicializar banco"
  );

  const previousClientes = new Map((previous.clientes || []).map((item) => [String(item.id), item]));
  const currentClientes = new Map((current.clientes || []).map((item) => [String(item.id), item]));
  const clientesChanged = [...currentClientes.values()].filter((item) => !equal(previousClientes.get(String(item.id)), item));
  const clientesRemoved = [...previousClientes.keys()].filter((id) => !currentClientes.has(id));

  if (clientesChanged.length) {
    throwIfError(
      await supabase.from("clientes").upsert(clientesChanged.map(clienteToRow), { onConflict: "id" }),
      "Erro ao salvar clientes"
    );
  }
  if (clientesRemoved.length) {
    throwIfError(
      await supabase.from("clientes").update({ dt_exc: new Date().toISOString() }).in("id", clientesRemoved),
      "Erro ao excluir clientes"
    );
  }

  for (const collection of COLLECTIONS) {
    const before = new Map((previous[collection] || []).map((item) => [String(item.id), item]));
    const after = new Map((current[collection] || []).map((item) => [String(item.id), item]));
    const changed = [...after.values()].filter((item) => !equal(before.get(String(item.id)), item));
    const removed = [...before.keys()].filter((id) => !after.has(id));

    if (changed.length) {
      const rows = changed.map((item) => ({
        modulo: collection,
        registro_id: String(item.id),
        empresa_id: item.empresaId || null,
        dados: item,
        dt_exc: null,
      }));
      throwIfError(
        await supabase.from("sistema_registros").upsert(rows, { onConflict: "modulo,registro_id" }),
        `Erro ao salvar ${collection}`
      );
    }
    if (removed.length) {
      throwIfError(
        await supabase
          .from("sistema_registros")
          .update({ dt_exc: new Date().toISOString() })
          .eq("modulo", collection)
          .in("registro_id", removed),
        `Erro ao excluir de ${collection}`
      );
    }
  }
}
