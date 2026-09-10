// Teste local com Chrome e banco em memória; nenhuma chamada ao banco real.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { createServer } from "vite";

const fixture = {
  empresas: [{ id: "empresa-admin", nome: "Empresa de teste", segmento: "comercio", status: "ativo" }],
  usuarios: [{ id: "usuario-admin", nome: "Administrador", usuario: "admin", senha: "admin", perfil: "master", empresaId: "empresa-admin" }],
  clientes: [{ id: "c0", nome: "Consumidor", empresaId: "empresa-admin" }, { id: "c1", codigo: "0002", nome: "Ana Teste", cpfCnpj: "123.456.789-00", telefone: "(11) 99999-0000", email: "ana@example.test", endereco: "Rua Teste", numero: "10", cidade: "São Paulo", estado: "SP", empresaId: "empresa-admin" }],
  servicos: [{ id: "s1", nome: "Consultoria", preco: 100, empresaId: "empresa-admin" }],
  produtos: [{ id: "p1", nome: "Produto de teste", quantidade: 10, precoVenda: 50, empresaId: "empresa-admin" }],
  funcionarios: [], contasPagar: [], contatosRetorno: [],
  ordens: [{ id: "o1", numero: "0001", clienteId: "c1", clienteNome: "Ana Teste", data: "2026-01-01", statusOS: "pendente", statusPagamento: "pendente", total: 100, itens: [{ uidLine: "i1", itemId: "s1", tipo: "servico", nome: "Consultoria", descricao: "Consultoria", qtd: 1, precoUnit: 100 }], origemOrcamentoId: "b1", empresaId: "empresa-admin" }],
  orcamentos: [{ id: "b1", numero: "0001", pedidoId: "o1", status: "convertido", convertidoEm: "2026-01-01", total: 100, clienteId: "c1", clienteNome: "Ana Teste", itens: [{ uidLine: "i1", nome: "Consultoria", descricao: "Consultoria", qtd: 1, precoUnit: 100 }], empresaId: "empresa-admin" }],
};

const tempPrefix = path.resolve(os.tmpdir(), "pedido-browser-");
const profile = await fs.mkdtemp(tempPrefix);
let browser;
let socket;
let server;
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
try {
  server = await createServer({
    cacheDir: path.join(profile, "vite-cache"),
    server: { host: "127.0.0.1", port: 5188, strictPort: true },
    plugins: [{
      name: "pedido-test-database", enforce: "pre",
      resolveId(id, importer) { if (id === "./lib/database" && importer?.replaceAll("\\", "/").endsWith("/src/App.jsx")) return "\0pedido-test-database"; },
      load(id) { if (id === "\0pedido-test-database") return `export async function loadDatabase() { return { database: structuredClone(window.__testDB), initialized: true }; } export async function syncDatabase(previous, current) { if (window.__failSave) throw new Error('Falha simulada'); window.__testDB = structuredClone(current); } export async function createCliente() { throw new Error('Fora do escopo do teste'); }`; },
      configureServer(vite) {
        vite.middlewares.use(async (req, res, next) => {
          if (req.url !== "/__pedido-test") return next();
          const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head><body><div id="root"></div><script>window.__testDB=${JSON.stringify(fixture)};localStorage.setItem('jato_sistem_ui_v1', JSON.stringify({usuarioId:'usuario-admin',empresaId:'empresa-admin',tab:'agenda'}));</script><script type="module" src="/src/main.jsx"></script></body></html>`;
          res.setHeader("Content-Type", "text/html");
          res.end(await vite.transformIndexHtml(req.url, html));
        });
      },
    }],
  });
  await server.listen();
  const chrome = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
  browser = spawn(chrome, ["--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "about:blank"], { windowsHide: true, stdio: "ignore" });
  let launchError;
  browser.on("error", (error) => { launchError = error; });
  let port;
  for (let i = 0; i < 100; i++) {
    if (launchError) throw launchError;
    try { port = (await fs.readFile(path.join(profile, "DevToolsActivePort"), "utf8")).split("\n")[0]; break; } catch { await pause(100); }
  }
  assert.ok(port, "Chrome não iniciou");
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  socket = new WebSocket(targets.find((target) => target.type === "page").webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  let sequence = 0;
  const pending = new Map();
  const errors = [];
  socket.onmessage = ({ data }) => {
    const message = JSON.parse(data);
    if (message.method === "Runtime.exceptionThrown") errors.push(message.params.exceptionDetails.text + ": " + message.params.exceptionDetails.exception?.description);
    if (pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) reject(new Error(JSON.stringify(message.error))); else resolve(message.result);
    }
  };
  const cdp = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence;
    const timeout = setTimeout(() => { pending.delete(id); reject(new Error(`Chrome não respondeu: ${method}`)); }, 15000);
    pending.set(id, { resolve: (value) => { clearTimeout(timeout); resolve(value); }, reject: (error) => { clearTimeout(timeout); reject(error); } });
    socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async (expression) => {
    const result = await cdp("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  };
  const until = async (expression) => { for (let i = 0; i < 100; i++) { if (await evaluate(expression)) return; await pause(100); } throw new Error(`Tempo excedido: ${expression}; ${errors.join("\n")}`); };
  const click = async (text) => { await evaluate(`(() => { const el = [...document.querySelectorAll('button')].find(el => el.offsetParent !== null && el.textContent.trim() === ${JSON.stringify(text)}); if (!el) throw Error('Botão não encontrado: ' + ${JSON.stringify(text)}); el.click(); })()`); await pause(120); };
  const fill = async (selector, value) => {
    await evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) throw Error('Campo não encontrado'); const proto = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(String(value))}); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); })()`);
    await pause(120);
  };
  const field = (label) => `[aria-label="${label}"]`;
  await cdp("Runtime.enable");
  await cdp("Page.enable");
  await cdp("Network.enable");
  await cdp("Network.setBlockedURLs", { urls: ["*supabase*"] });
  await cdp("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false });
  await cdp("Page.navigate", { url: "http://127.0.0.1:5188/__pedido-test" });
  await until("document.body.textContent.includes('Selecione o cliente')");
  assert.equal(await evaluate("[...document.querySelectorAll('nav button')].some(el => el.textContent.trim() === 'Agenda')"), false);
  assert.equal(await evaluate("document.querySelector('fieldset').textContent.includes('Programação')"), false);
  assert.equal(await evaluate("document.querySelector('fieldset').textContent.includes('Funcionário')"), false);
  assert.equal(await evaluate("[...document.querySelectorAll('input[readonly]')].every(el => el.value === '')"), true);
  await click("Selecione o cliente");
  await evaluate("[...document.querySelectorAll('[role=dialog] button')].find(el => el.textContent.includes('Ana Teste')).click()");
  await until("[...document.querySelectorAll('input')].some(el => el.value === 'ana@example.test')");
  await click("Adicionar item");
  await fill(field("Código do item 1"), "servico:s1");
  await fill(field("Quantidade do item 1"), 2);
  await fill(field("Desconto do item 1"), 10);
  await click("Adicionar item");
  await fill(field("Código do item 2"), "produto:p1");
  await fill("textarea", "Entregar na recepção.");
  await click("Adicionar pagamento");
  await fill(field("Forma do pagamento 1"), "Pix");
  await fill(field("Valor do pagamento 1"), 40);
  await click("Adicionar pagamento");
  await fill(field("Modalidade do pagamento 2"), "prazo");
  await fill(field("Condição do pagamento 2"), 3);
  await fill(field("Forma do pagamento 2"), "Boleto");
  await fill(field("Vencimento do pagamento 2, parcela 2"), "2027-02-15");
  const screenshot = await cdp("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
  await fs.mkdir(".test-artifacts", { recursive: true });
  await fs.writeFile(".test-artifacts/pedido-desktop.png", Buffer.from(screenshot.data, "base64"));
  await click("Salvar pedido");
  await until("window.__testDB.ordens.length === 2");
  let order = await evaluate("window.__testDB.ordens.find(o => o.numero === '0002')");
  assert.equal(order.total, 240);
  assert.equal(order.statusOS, "pendente");
  assert.equal(order.pagamentos[1].valor, 200);
  assert.equal(order.parcelas[2].dataVencimento, "2027-02-15");
  assert.equal(await evaluate("window.__testDB.produtos[0].quantidade"), 10);
  await evaluate("[...document.querySelectorAll('tr')].find(el => el.textContent.includes('#0002')).querySelector('button[title=\"Continuar venda / editar pedido\"]').click()");
  await until(`document.querySelector(${JSON.stringify(field("Vencimento do pagamento 2, parcela 2"))})?.value === '2027-02-15'`);
  await click("Concluir pedido");
  await until("window.__testDB.ordens.find(o => o.numero === '0002').statusOS === 'concluido'");
  order = await evaluate("window.__testDB.ordens.find(o => o.numero === '0002')");
  assert.equal(order.valorPago, 40);
  assert.equal(order.statusPagamento, "parcial");
  assert.equal(order.parcelas.length, 4);
  assert.equal(await evaluate("window.__testDB.produtos[0].quantidade"), 9);
  assert.equal(await evaluate("document.querySelector('.os-print-area').textContent.includes('15/02/2027')"), true);
  assert.equal(await evaluate("document.querySelector('.os-print-area').textContent.includes('Entregar na recepção.')"), true);
  await click("Fechar");
  await click("Novo pedido");
  assert.equal(await evaluate("[...document.querySelectorAll('input[readonly]')].every(el => el.value === '')"), true);
  await click("Lista de pedidos");
  await evaluate("window.confirm = () => true; [...document.querySelectorAll('tr')].find(el => el.textContent.includes('#0001')).querySelector('button[title=Excluir]').click()");
  await until("window.__testDB.orcamentos[0].status === 'pendente'");
  assert.equal(await evaluate("window.__testDB.orcamentos[0].pedidoId"), null);
  await cdp("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, screenWidth: 390, screenHeight: 844, deviceScaleFactor: 1, mobile: true });
  await cdp("Page.navigate", { url: "http://127.0.0.1:5188/__pedido-test" });
  await until("window.__testDB?.ordens.length === 1 && document.body.textContent.includes('Selecione o cliente')");
  await cdp("Emulation.setPageScaleFactor", { pageScaleFactor: 1 });
  await pause(250);
  assert.equal(await evaluate("document.body.scrollWidth <= 390 && document.querySelector('.app-main').scrollWidth <= 390"), true, "O conteúdo da página deve caber na largura do celular");
  assert.equal(await evaluate("[...document.querySelectorAll('.pedido-tabela')].every(el => el.clientWidth <= 390 && getComputedStyle(el).overflowX === 'auto')"), true, "As tabelas devem permitir rolagem dentro do pedido");
  const mobile = await cdp("Page.captureScreenshot", { format: "png", captureBeyondViewport: false, clip: { x: 0, y: 0, width: 390, height: 844, scale: 1 } });
  await fs.writeFile(".test-artifacts/pedido-mobile.png", Buffer.from(mobile.data, "base64"));
  assert.deepEqual(errors, []);
  console.log("OK: cliente em branco, dados pessoais, itens, descontos, pagamentos mistos, vencimentos, salvar/reabrir/concluir, estoque, recibo, celular e exclusão liberando orçamento.");
} finally {
  socket?.close();
  if (browser && browser.exitCode === null) { browser.kill(); await pause(1000); }
  await server?.close();
  if (!path.resolve(profile).startsWith(tempPrefix)) throw new Error("Perfil temporário fora da pasta permitida");
  await fs.rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
}
