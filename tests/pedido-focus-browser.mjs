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
      load(id) { if (id === "\0pedido-test-database") return `export async function loadDatabase() { return { database: structuredClone(window.__testDB), initialized: true }; } export async function syncDatabase(previous, current) { await new Promise(resolve => setTimeout(resolve, 600)); if (window.__failSave) throw new Error('Falha simulada'); window.__testDB = structuredClone(current); } export async function createCliente() { throw new Error('Fora do escopo do teste'); }`; },
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

  for (const selector of [field("Descri??o do item 1"), "textarea"]) {
    await pause(700);
    await evaluate(`document.querySelector(${JSON.stringify(selector)}).focus()`);
    await cdp("Input.insertText", { text: " primeiro" });
    await pause(450);
    assert.equal(await evaluate(`document.activeElement === document.querySelector(${JSON.stringify(selector)})`), true, "Campo perdeu foco durante autosave");
    await cdp("Input.insertText", { text: " segundo" });
    await pause(1600);
    assert.equal(await evaluate(`document.activeElement === document.querySelector(${JSON.stringify(selector)})`), true, "Campo perdeu foco ap?s autosave");
    const value = await evaluate(`document.querySelector(${JSON.stringify(selector)}).value`);
    const saved = await evaluate(`window.__testDB.ordens.find(o => o.numero === '0002')`);
    assert.equal(selector === "textarea" ? saved.observacao : saved.itens[0].descricao, value.trim(), "Digita??o durante salvamento deve persistir");
  }
  assert.deepEqual(errors, []);
  console.log("Descri??o e observa??o mant?m foco e salvam a digita??o durante autosave.");

} finally {
  socket?.close();
  if (browser && browser.exitCode === null) { browser.kill(); await pause(1000); }
  await server?.close();
  if (!path.resolve(profile).startsWith(tempPrefix)) throw new Error("Perfil temporário fora da pasta permitida");
  await fs.rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
}
