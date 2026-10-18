/* Tempo — interface do freelancer (/tempo).
 *
 * Sem compilação nem bibliotecas: um só ficheiro, servido tal e qual pelo Frappe.
 * As contas (arredondamento, valor, preço/hora) fazem-se SEMPRE no servidor; aqui
 * só se mostra. Os textos estão em português e traduzem-se pelo csv da app
 * (window.TEMPO_BOOT.traducoes). Nenhum endereço absoluto: o mesmo código serve
 * em qualquer domínio que aponte para o site.
 */
(function () {
	"use strict";

	const BOOT = window.TEMPO_BOOT || {};
	const TR = BOOT.traducoes || {};
	const LANG = BOOT.lang || "pt";
	const LOCALE = { pt: "pt-PT", es: "es-ES", en: "en-GB", fr: "fr-FR" }[LANG.slice(0, 2)] || LANG;

	// ── utilidades ─────────────────────────────────────────────────────────
	function t(s, ...a) {
		let r = TR[s] || s;
		a.forEach((v, i) => { r = r.split("{" + i + "}").join(v); });
		return r;
	}

	function h(tag, attrs, ...filhos) {
		const el = document.createElement(tag);
		for (const [k, v] of Object.entries(attrs || {})) {
			if (v === null || v === undefined || v === false) continue;
			if (k === "class") el.className = v;
			else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
			else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
			else if (k === "value") el.value = v;
			else if (k === "checked") el.checked = !!v;
			else if (k === "html") el.innerHTML = v;
			else el.setAttribute(k, v === true ? "" : v);
		}
		for (const f of filhos.flat(Infinity)) {
			if (f === null || f === undefined || f === false) continue;
			el.append(f instanceof Node ? f : document.createTextNode(String(f)));
		}
		return el;
	}

	const fmtNum = (n, d = 2) => new Intl.NumberFormat(LOCALE, { minimumFractionDigits: d, maximumFractionDigits: d }).format(n || 0);
	const fmtDinheiro = (n) => new Intl.NumberFormat(LOCALE, { style: "currency", currency: (S.definicoes && S.definicoes.moeda) || "EUR" }).format(n || 0);
	function fmtMin(min) {
		min = Math.round(min || 0);
		const hh = Math.floor(min / 60), mm = min % 60;
		return hh + ":" + String(mm).padStart(2, "0");
	}
	function fmtRelogio(seg) {
		seg = Math.max(0, Math.floor(seg));
		const hh = Math.floor(seg / 3600), mm = Math.floor((seg % 3600) / 60), ss = seg % 60;
		return [hh, mm, ss].map((x, i) => (i ? String(x).padStart(2, "0") : x)).join(":");
	}
	const isoData = (d) => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
	const deIso = (s) => { const [a, m, d] = s.split("-").map(Number); return new Date(a, m - 1, d); };
	const fmtData = (s, opts) => deIso(s).toLocaleDateString(LOCALE, opts || { weekday: "short", day: "numeric", month: "short" });
	function segunda(d) { const r = new Date(d); const w = (r.getDay() + 6) % 7; r.setDate(r.getDate() - w); return r; }
	function somaDias(d, n) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
	// "1:30", "1h30", "90", "1,5" → minutos
	function lerDuracao(txt) {
		txt = String(txt || "").trim().toLowerCase().replace(",", ".");
		if (!txt) return 0;
		let m = txt.match(/^(\d+)\s*[:h]\s*(\d{1,2})?\s*m?$/);
		if (m) return Number(m[1]) * 60 + Number(m[2] || 0);
		m = txt.match(/^(\d+(?:\.\d+)?)\s*h$/);
		if (m) return Math.round(Number(m[1]) * 60);
		m = txt.match(/^(\d+(?:\.\d+)?)$/);
		if (m) return txt.includes(".") ? Math.round(Number(m[1]) * 60) : Number(m[1]);
		return NaN;
	}

	// ── servidor ───────────────────────────────────────────────────────────
	async function api(metodo, args, post) {
		const url = "/api/method/orbit_tempo.api." + metodo;
		const op = { headers: { Accept: "application/json", "X-Frappe-CSRF-Token": BOOT.csrf_token } };
		let alvo = url;
		if (post) {
			op.method = "POST";
			op.headers["Content-Type"] = "application/json";
			op.body = JSON.stringify(args || {});
		} else if (args) {
			const q = new URLSearchParams();
			Object.entries(args).forEach(([k, v]) => v !== undefined && v !== null && q.append(k, v));
			alvo += "?" + q.toString();
		}
		const r = await fetch(alvo, op);
		let j = {};
		try { j = await r.json(); } catch (e) { /* resposta sem corpo */ }
		if (r.status === 403 && /login/i.test(JSON.stringify(j))) { location.href = "/login?redirect-to=/tempo"; return; }
		if (!r.ok || j.exc) {
			throw new Error(mensagemDoServidor(j) || t("Ocorreu um erro. Tente novamente."));
		}
		return j.message;
	}
	function mensagemDoServidor(j) {
		try {
			const msgs = JSON.parse(j._server_messages || "[]").map((m) => JSON.parse(m).message);
			const div = document.createElement("div");
			div.innerHTML = msgs.join(" ");
			return div.textContent;
		} catch (e) { return j.exception || ""; }
	}

	// ── estado ─────────────────────────────────────────────────────────────
	const S = {
		vista: "hoje",
		definicoes: null,
		clientes: [],
		acordos: [],
		cronometro: null,
		registosHoje: [],
		semana: segunda(new Date()),
		registosSemana: [],
		mes: isoData(new Date()).slice(0, 7),
		resumo: null,
		estudos: [],
		estudo: null,
		resultado: null,
		editar: null, // registo em edição (modal)
	};
	const raiz = document.getElementById("tempo");
	let tique = null;

	function aviso(msg, tipo) {
		const el = h("div", { class: "tp-aviso " + (tipo || ""), role: "status" }, msg);
		document.body.append(el);
		setTimeout(() => el.classList.add("tp-sai"), 3200);
		setTimeout(() => el.remove(), 3800);
	}
	async function tentar(fn) {
		try { return await fn(); } catch (e) { aviso(e.message, "tp-erro"); }
	}

	const acordo = (nome) => S.acordos.find((a) => a.name === nome) || {};
	const cliente = (nome) => S.clientes.find((c) => c.name === nome) || {};
	const acordosAtivos = () => S.acordos.filter((a) => a.ativo && cliente(a.cliente).ativo !== 0);

	function seletorAcordo(valor, onchange, extra) {
		const grupos = {};
		acordosAtivos().forEach((a) => { (grupos[a.cliente] = grupos[a.cliente] || []).push(a); });
		return h("select", Object.assign({ class: "tp-campo", onchange, "aria-label": t("Acordo") }, extra || {}),
			h("option", { value: "" }, t("— Escolha o cliente e o acordo —")),
			Object.entries(grupos).map(([c, lista]) =>
				h("optgroup", { label: cliente(c).nome_cliente || c },
					lista.map((a) => h("option", { value: a.name, selected: a.name === valor ? "selected" : null }, a.titulo)))));
	}

	// ── estrutura ──────────────────────────────────────────────────────────
	const VISTAS = [
		["hoje", "Hoje", "⏱"],
		["semana", "Semana", "▦"],
		["clientes", "Clientes", "☰"],
		["resumo", "Resumo", "Σ"],
		["preco", "Preço/hora", "€"],
		["definicoes", "Definições", "⚙"],
	];

	function render() {
		raiz.classList.remove("tp-a-carregar");
		raiz.removeAttribute("aria-busy");
		const d = S.definicoes || {};
		if (d.cor) document.documentElement.style.setProperty("--tp-acento", d.cor);
		const conteudo = { hoje: vHoje, semana: vSemana, clientes: vClientes, resumo: vResumo, preco: vPreco, definicoes: vDefinicoes }[S.vista]();
		raiz.replaceChildren(
			h("header", { class: "tp-topo" },
				h("a", { class: "tp-marca", href: "#/hoje" },
					d.logotipo ? h("img", { src: d.logotipo, alt: "" }) : h("img", { src: "/assets/orbit_tempo/icons/tempo.svg", alt: "" }),
					h("span", {}, d.nome_comercial || "Tempo")),
				S.cronometro ? h("a", { class: "tp-pilula", href: "#/hoje" }, "● ", h("span", { "data-relogio": "1" }, "")) : null,
				h("a", { class: "tp-sair", href: "/app", title: t("Voltar ao Orbit") }, "↩")),
			h("nav", { class: "tp-nav", "aria-label": t("Secções") },
				VISTAS.map(([id, nome, ic]) =>
					h("a", { href: "#/" + id, class: S.vista === id ? "tp-ativo" : "", "aria-current": S.vista === id ? "page" : null },
						h("span", { class: "tp-ic", "aria-hidden": "true" }, ic), h("span", {}, t(nome))))),
			h("main", { class: "tp-corpo" }, conteudo));
		atualizarRelogios();
	}

	function atualizarRelogios() {
		clearInterval(tique);
		if (!S.cronometro) return;
		const inicio = new Date(S.cronometro.inicio.replace(" ", "T"));
		const desvio = new Date(S.agoraServidor.replace(" ", "T")) - S.agoraLocal; // relógio do servidor manda
		const passo = () => {
			const seg = (Date.now() + desvio - inicio) / 1000;
			document.querySelectorAll("[data-relogio]").forEach((e) => { e.textContent = fmtRelogio(seg); });
		};
		passo();
		tique = setInterval(passo, 1000);
	}

	// ── Hoje ───────────────────────────────────────────────────────────────
	function vHoje() {
		const c = S.cronometro;
		let cartao;
		if (c) {
			const a = acordo(c.acordo);
			const desc = h("input", { class: "tp-campo", value: c.descricao || "", placeholder: t("O que está a fazer?") });
			cartao = h("section", { class: "tp-cartao tp-crono tp-a-correr" },
				h("div", { class: "tp-crono-rel", "data-relogio": "1" }, ""),
				h("div", { class: "tp-crono-quem" }, h("b", {}, a.titulo || c.acordo), " · ", cliente(c.cliente).nome_cliente || ""),
				desc,
				h("div", { class: "tp-botoes" },
					h("button", { class: "tp-btn tp-primario", onclick: () => tentar(async () => {
						await api("parar", { registo: c.name, descricao: desc.value }, true);
						S.cronometro = null; await carregarHoje(); aviso(t("Registo guardado."));
					}) }, "■ " + t("Parar e guardar")),
					h("button", { class: "tp-btn tp-discreto", onclick: () => confirm(t("Descartar este cronómetro sem guardar?")) && tentar(async () => {
						await api("descartar", { registo: c.name }, true); S.cronometro = null; render();
					}) }, t("Descartar"))));
		} else if (!acordosAtivos().length) {
			cartao = h("section", { class: "tp-cartao tp-vazio" },
				h("p", {}, t("Para começar, crie um cliente e um acordo (como cobra o tempo a esse cliente).")),
				h("a", { class: "tp-btn tp-primario", href: "#/clientes" }, t("Criar o primeiro cliente")));
		} else {
			let escolhido = localStorage.getItem("tempo.ultimoAcordo") || "";
			if (!acordo(escolhido).name) escolhido = "";
			const sel = seletorAcordo(escolhido, (e) => { escolhido = e.target.value; });
			const desc = h("input", { class: "tp-campo", placeholder: t("O que vai fazer? (opcional)") });
			cartao = h("section", { class: "tp-cartao tp-crono" },
				h("div", { class: "tp-crono-rel" }, "0:00:00"),
				sel, desc,
				h("div", { class: "tp-botoes" },
					h("button", { class: "tp-btn tp-primario tp-grande", onclick: () => {
						if (!sel.value) { aviso(t("Escolha o acordo."), "tp-erro"); sel.focus(); return; }
						tentar(async () => {
							try { localStorage.setItem("tempo.ultimoAcordo", sel.value); } catch (e) { /* sem armazenamento */ }
							S.cronometro = await api("iniciar", { acordo: sel.value, descricao: desc.value }, true);
							S.agoraServidor = S.cronometro.inicio; S.agoraLocal = Date.now();
							render();
						});
					} }, "▶ " + t("Iniciar"))));
		}

		const total = S.registosHoje.reduce((s, r) => s + (r.duracao_minutos || 0), 0);
		const valor = S.registosHoje.reduce((s, r) => s + (r.valor || 0), 0);
		return [
			cartao,
			h("section", { class: "tp-cartao" },
				h("div", { class: "tp-cab" }, h("h2", {}, t("Hoje")),
					h("span", { class: "tp-tot" }, fmtMin(total) + " h · " + fmtDinheiro(valor)),
					h("button", { class: "tp-btn", onclick: () => abrirRegisto({ data: BOOT.hoje || isoData(new Date()) }) }, "+ " + t("Registo manual"))),
				listaRegistos(S.registosHoje, false)),
		];
	}

	function listaRegistos(lista, comData) {
		if (!lista.length) return h("p", { class: "tp-nada" }, t("Sem registos."));
		return h("ul", { class: "tp-lista" }, lista.map((r) => {
			const a = acordo(r.acordo);
			return h("li", { class: "tp-reg", onclick: () => abrirRegisto(r), tabindex: "0", onkeydown: (e) => e.key === "Enter" && abrirRegisto(r) },
				h("span", { class: "tp-cor", style: { background: a.cor || "var(--tp-acento)" } }),
				h("div", { class: "tp-reg-txt" },
					h("b", {}, a.titulo || r.acordo, h("small", {}, " · " + (cliente(r.cliente).nome_cliente || ""))),
					h("span", {}, (comData ? fmtData(r.data) + " · " : "") + (r.descricao || t("(sem descrição)")))),
				h("div", { class: "tp-reg-num" },
					h("b", {}, fmtMin(r.duracao_minutos)),
					h("small", {}, r.oferta ? t("oferta") : !r.faturavel ? t("não faturável") :
						(r.minutos_faturados !== Math.round(r.duracao_minutos) ? t("cobra {0}", fmtMin(r.minutos_faturados)) + " · " : "") + fmtDinheiro(r.valor))));
		}));
	}

	// ── modal do registo ───────────────────────────────────────────────────
	function abrirRegisto(r) {
		const novo = !r.name;
		const v = {
			acordo: r.acordo || localStorage.getItem("tempo.ultimoAcordo") || "",
			data: r.data || isoData(new Date()),
			duracao: r.name ? fmtMin(r.duracao_minutos) : "",
			descricao: r.descricao || "",
			faturavel: r.name ? r.faturavel : 1,
			oferta: r.oferta || 0,
		};
		const sel = seletorAcordo(v.acordo, null, { required: true });
		const data = h("input", { class: "tp-campo", type: "date", value: v.data, required: true });
		const dur = h("input", { class: "tp-campo", value: v.duracao, placeholder: "1:30", inputmode: "decimal", required: true,
			"aria-describedby": "tp-dur-ajuda" });
		const desc = h("textarea", { class: "tp-campo", rows: "3", placeholder: t("O que fez?") }, v.descricao);
		const fat = h("input", { type: "checkbox", checked: !!v.faturavel });
		const ofe = h("input", { type: "checkbox", checked: !!v.oferta });
		const fechar = () => fundo.remove();
		const guardar = (e) => {
			e.preventDefault();
			const minutos = lerDuracao(dur.value);
			if (!sel.value) { aviso(t("Escolha o acordo."), "tp-erro"); return; }
			if (!minutos || isNaN(minutos)) { aviso(t("Duração inválida. Exemplos: 1:30, 90, 1,5h."), "tp-erro"); dur.focus(); return; }
			tentar(async () => {
				await api("guardar_registo", { dados: { name: r.name, acordo: sel.value, data: data.value, minutos,
					descricao: desc.value, faturavel: fat.checked ? 1 : 0, oferta: ofe.checked ? 1 : 0 } }, true);
				fechar(); await recarregarVista(); aviso(t("Registo guardado."));
			});
		};
		const fundo = h("div", { class: "tp-fundo", onclick: (e) => e.target === fundo && fechar() },
			h("form", { class: "tp-modal", onsubmit: guardar, role: "dialog", "aria-modal": "true", "aria-label": novo ? t("Novo registo") : t("Editar registo") },
				h("h2", {}, novo ? t("Novo registo") : t("Editar registo")),
				h("label", {}, t("Acordo"), sel),
				h("div", { class: "tp-duas" },
					h("label", {}, t("Data"), data),
					h("label", {}, t("Duração"), dur)),
				h("small", { id: "tp-dur-ajuda", class: "tp-ajuda" }, t("Exemplos: 1:30, 90 (minutos), 1,5h. O arredondamento do acordo aplica-se ao gravar.")),
				h("label", {}, t("Descrição"), desc),
				h("div", { class: "tp-checks" },
					h("label", {}, fat, " ", t("Faturável")),
					h("label", {}, ofe, " ", t("Oferta (conta como feito, não se cobra)"))),
				h("div", { class: "tp-botoes" },
					h("button", { class: "tp-btn tp-primario", type: "submit" }, t("Guardar")),
					h("button", { class: "tp-btn", type: "button", onclick: fechar }, t("Cancelar")),
					novo ? null : h("button", { class: "tp-btn tp-perigo", type: "button", onclick: () => confirm(t("Apagar este registo?")) && tentar(async () => {
						await api("apagar_registo", { registo: r.name }, true); fechar(); await recarregarVista(); aviso(t("Registo apagado."));
					}) }, t("Apagar")))));
		document.body.append(fundo);
		(novo && !v.acordo ? sel : dur).focus();
		document.addEventListener("keydown", function esc(e) { if (e.key === "Escape") { fechar(); document.removeEventListener("keydown", esc); } });
	}

	// ── Semana ─────────────────────────────────────────────────────────────
	function vSemana() {
		const dias = [...Array(7)].map((_, i) => isoData(somaDias(S.semana, i)));
		const porAcordo = {};
		S.registosSemana.forEach((r) => {
			const l = (porAcordo[r.acordo] = porAcordo[r.acordo] || {});
			l[r.data] = (l[r.data] || 0) + (r.duracao_minutos || 0);
		});
		const linhas = Object.keys(porAcordo);
		const totDia = dias.map((d) => linhas.reduce((s, a) => s + (porAcordo[a][d] || 0), 0));
		const totSemana = totDia.reduce((a, b) => a + b, 0);
		const valor = S.registosSemana.reduce((s, r) => s + (r.valor || 0), 0);
		const fim = somaDias(S.semana, 6);
		const mudar = (n) => () => { S.semana = somaDias(S.semana, 7 * n); carregarSemana(); };
		const juntar = h("div", { class: "tp-juntar" },
			seletorAcordo("", (e) => { if (e.target.value) { porAcordo[e.target.value] = porAcordo[e.target.value] || {}; S.linhasExtra = [...(S.linhasExtra || []), e.target.value]; render(); } },
				{ "aria-label": t("Juntar linha") }));
		(S.linhasExtra || []).forEach((a) => { if (!porAcordo[a]) porAcordo[a] = {}; });
		const todas = Object.keys(porAcordo);
		return [
			h("section", { class: "tp-cartao" },
				h("div", { class: "tp-cab" },
					h("button", { class: "tp-btn", onclick: mudar(-1), "aria-label": t("Semana anterior") }, "‹"),
					h("h2", {}, fmtData(dias[0], { day: "numeric", month: "short" }) + " – " + fmtData(isoData(fim), { day: "numeric", month: "short", year: "numeric" })),
					h("button", { class: "tp-btn", onclick: mudar(1), "aria-label": t("Semana seguinte") }, "›"),
					h("span", { class: "tp-tot" }, fmtMin(totSemana) + " h · " + fmtDinheiro(valor))),
				h("div", { class: "tp-tabela-rola" },
					h("table", { class: "tp-grelha" },
						h("thead", {}, h("tr", {}, h("th", {}, t("Acordo")),
							dias.map((d) => h("th", { class: d === isoData(new Date()) ? "tp-hoje" : "" }, fmtData(d, { weekday: "short", day: "numeric" }))),
							h("th", {}, t("Total")))),
						h("tbody", {},
							todas.map((a) => {
								const tot = dias.reduce((s, d) => s + (porAcordo[a][d] || 0), 0);
								return h("tr", {},
									h("th", { scope: "row" }, h("span", { class: "tp-cor", style: { background: acordo(a).cor || "var(--tp-acento)" } }),
										acordo(a).titulo || a, h("small", {}, cliente(acordo(a).cliente).nome_cliente || "")),
									dias.map((d) => h("td", {},
										h("button", { class: "tp-cel" + (porAcordo[a][d] ? " tp-cheia" : ""), title: t("Juntar tempo"),
											onclick: () => abrirRegisto({ acordo: a, data: d }) }, porAcordo[a][d] ? fmtMin(porAcordo[a][d]) : "+"))),
									h("td", { class: "tp-num" }, h("b", {}, fmtMin(tot))));
							})),
						h("tfoot", {}, h("tr", {}, h("th", {}, t("Total")), totDia.map((m) => h("td", { class: "tp-num" }, m ? fmtMin(m) : "")),
							h("td", { class: "tp-num" }, h("b", {}, fmtMin(totSemana))))))),
				juntar),
			h("section", { class: "tp-cartao" }, h("h2", {}, t("Registos da semana")), listaRegistos(S.registosSemana, true)),
		];
	}

	// ── Clientes e acordos ─────────────────────────────────────────────────
	function vClientes() {
		return [
			h("section", { class: "tp-cartao" },
				h("div", { class: "tp-cab" }, h("h2", {}, t("Clientes")),
					h("button", { class: "tp-btn tp-primario", onclick: () => formCliente({ ativo: 1 }) }, "+ " + t("Novo cliente"))),
				S.clientes.length ? null : h("p", { class: "tp-nada" }, t("Ainda não há clientes.")),
				S.clientes.map((c) => {
					const acs = S.acordos.filter((a) => a.cliente === c.name);
					return h("div", { class: "tp-cliente" + (c.ativo ? "" : " tp-inativo") },
						h("div", { class: "tp-cab" },
							h("h3", {}, c.nome_cliente, c.ativo ? null : h("small", {}, " · " + t("inativo"))),
							h("span", { class: "tp-sub" }, [c.nif, c.email].filter(Boolean).join(" · ")),
							h("button", { class: "tp-btn tp-discreto", onclick: () => formCliente(c) }, t("Editar")),
							h("button", { class: "tp-btn", onclick: () => formAcordo({ cliente: c.name, tipo: "Hora", ativo: 1 }) }, "+ " + t("Acordo"))),
						acs.length ? h("ul", { class: "tp-acordos" }, acs.map((a) =>
							h("li", { class: a.ativo ? "" : "tp-inativo" },
								h("span", { class: "tp-cor", style: { background: a.cor || "var(--tp-acento)" } }),
								h("b", {}, a.titulo), h("span", {}, " · " + t(a.tipo)),
								h("span", { class: "tp-sub" }, a.tipo === "Preço fixo" ? t("não se cobra à hora") :
									fmtDinheiro(a.preco_efetivo) + "/h" + (a.preco_hora ? "" : " (" + t("das Definições") + ")")),
								h("button", { class: "tp-btn tp-discreto", onclick: () => formAcordo(a) }, t("Editar")))))
							: h("p", { class: "tp-nada" }, t("Sem acordos: crie um para poder registar tempo.")));
				})),
		];
	}

	function modal(titulo, campos, aoGuardar) {
		const fechar = () => fundo.remove();
		const fundo = h("div", { class: "tp-fundo", onclick: (e) => e.target === fundo && fechar() },
			h("form", { class: "tp-modal", role: "dialog", "aria-modal": "true", "aria-label": titulo,
				onsubmit: (e) => { e.preventDefault(); tentar(async () => { await aoGuardar(); fechar(); }); } },
				h("h2", {}, titulo), campos,
				h("div", { class: "tp-botoes" },
					h("button", { class: "tp-btn tp-primario", type: "submit" }, t("Guardar")),
					h("button", { class: "tp-btn", type: "button", onclick: fechar }, t("Cancelar")))));
		document.body.append(fundo);
		const primeiro = fundo.querySelector("input,select,textarea");
		if (primeiro) primeiro.focus();
	}

	function campo(rotulo, el, ajuda) { return h("label", {}, rotulo, el, ajuda ? h("small", { class: "tp-ajuda" }, ajuda) : null); }

	function formCliente(c) {
		const f = {
			nome_cliente: h("input", { class: "tp-campo", value: c.nome_cliente || "", required: true }),
			nif: h("input", { class: "tp-campo", value: c.nif || "" }),
			email: h("input", { class: "tp-campo", type: "email", value: c.email || "" }),
			telefone: h("input", { class: "tp-campo", type: "tel", value: c.telefone || "" }),
			idioma: h("select", { class: "tp-campo" }, ["", "pt", "es", "en", "fr"].map((l) =>
				h("option", { value: l, selected: (c.idioma || "") === l ? "selected" : null }, l ? { pt: "Português", es: "Español", en: "English", fr: "Français" }[l] : "—"))),
			notas: h("textarea", { class: "tp-campo", rows: "2" }, c.notas || ""),
			ativo: h("input", { type: "checkbox", checked: c.ativo !== 0 }),
		};
		modal(c.name ? t("Editar cliente") : t("Novo cliente"), [
			campo(t("Nome"), f.nome_cliente),
			h("div", { class: "tp-duas" }, campo(t("NIF / NIF-IVA"), f.nif), campo(t("Língua"), f.idioma)),
			h("div", { class: "tp-duas" }, campo(t("Email"), f.email, t("Para o portal de consulta e os extratos.")), campo(t("Telefone"), f.telefone)),
			campo(t("Notas"), f.notas),
			h("label", { class: "tp-checks" }, f.ativo, " ", t("Ativo")),
		], async () => {
			await api("guardar_cliente", { dados: { name: c.name, nome_cliente: f.nome_cliente.value, nif: f.nif.value, email: f.email.value,
				telefone: f.telefone.value, idioma: f.idioma.value, notas: f.notas.value, ativo: f.ativo.checked ? 1 : 0 } }, true);
			await carregarDados(); render(); aviso(t("Cliente guardado."));
		});
	}

	function formAcordo(a) {
		const d = S.definicoes || {};
		const f = {
			titulo: h("input", { class: "tp-campo", value: a.titulo || "", required: true, placeholder: t("ex.: Consultoria de exportação") }),
			cliente: h("select", { class: "tp-campo", required: true }, S.clientes.map((c) =>
				h("option", { value: c.name, selected: c.name === a.cliente ? "selected" : null }, c.nome_cliente))),
			tipo: h("select", { class: "tp-campo" }, [["Hora", "À hora"], ["Preço fixo", "Preço fixo (só para medir a rentabilidade)"],
				["Pack", "Pack de horas (em breve)"], ["Avença", "Avença (em breve)"]].map(([v, r]) =>
				h("option", { value: v, selected: (a.tipo || "Hora") === v ? "selected" : null, disabled: v === "Pack" || v === "Avença" ? "disabled" : null }, t(r)))),
			preco_hora: h("input", { class: "tp-campo", type: "number", step: "0.01", min: "0", value: a.preco_hora || "",
				placeholder: d.preco_hora ? fmtNum(d.preco_hora) : "" }),
			arredondamento_bloco: h("input", { class: "tp-campo", type: "number", min: "0", step: "1", value: a.arredondamento_bloco ?? "",
				placeholder: String(d.arredondamento_bloco ?? 15) }),
			arredondamento_modo: h("select", { class: "tp-campo" }, [["", t("Das Definições")], ["cima", t("Para cima")], ["proximo", t("Ao mais próximo")]].map(([v, r]) =>
				h("option", { value: v, selected: (a.arredondamento_modo || "") === v ? "selected" : null }, r))),
			minimo_minutos: h("input", { class: "tp-campo", type: "number", min: "0", step: "1", value: a.minimo_minutos ?? "",
				placeholder: String(d.minimo_minutos || 0) }),
			cor: h("input", { class: "tp-campo tp-cor-in", type: "color", value: a.cor || "#22303d" }),
			ativo: h("input", { type: "checkbox", checked: a.ativo !== 0 }),
		};
		modal(a.name ? t("Editar acordo") : t("Novo acordo"), [
			campo(t("Título"), f.titulo),
			h("div", { class: "tp-duas" }, campo(t("Cliente"), f.cliente), campo(t("Tipo"), f.tipo)),
			campo(t("Preço/hora"), f.preco_hora, d.preco_hora ? t("Vazio = {0} (das Definições / estudo do preço).", fmtDinheiro(d.preco_hora)) : t("Vazio = o das Definições.")),
			h("div", { class: "tp-tres" },
				campo(t("Bloco (min)"), f.arredondamento_bloco), campo(t("Arredondar"), f.arredondamento_modo), campo(t("Mínimo (min)"), f.minimo_minutos)),
			h("div", { class: "tp-duas" }, campo(t("Cor"), f.cor), h("label", { class: "tp-checks" }, f.ativo, " ", t("Ativo"))),
		], async () => {
			await api("guardar_acordo", { dados: { name: a.name, titulo: f.titulo.value, cliente: f.cliente.value, tipo: f.tipo.value,
				preco_hora: f.preco_hora.value, arredondamento_bloco: f.arredondamento_bloco.value, arredondamento_modo: f.arredondamento_modo.value,
				minimo_minutos: f.minimo_minutos.value, cor: f.cor.value, ativo: f.ativo.checked ? 1 : 0 } }, true);
			await carregarDados(); render(); aviso(t("Acordo guardado."));
		});
	}

	// ── Resumo ─────────────────────────────────────────────────────────────
	function vResumo() {
		const r = S.resumo;
		const mesIn = h("input", { class: "tp-campo tp-curto", type: "month", value: S.mes,
			onchange: (e) => { S.mes = e.target.value; carregarResumo(); } });
		if (!r) return h("section", { class: "tp-cartao" }, mesIn, h("p", { class: "tp-nada" }, t("A carregar…")));
		const tot = r.linhas.reduce((s, l) => ({ reais: s.reais + l.minutos_reais, cobrar: s.cobrar + l.minutos_cobrar,
			oferta: s.oferta + l.minutos_oferta, valor: s.valor + l.valor }), { reais: 0, cobrar: 0, oferta: 0, valor: 0 });
		const efetiva = tot.reais ? tot.valor / (tot.reais / 60) : 0;
		const preco = (S.definicoes || {}).preco_hora;
		return [
			h("section", { class: "tp-cartao" },
				h("div", { class: "tp-cab" }, h("h2", {}, t("Resumo do mês")), mesIn),
				h("div", { class: "tp-numeros" },
					numero(t("Horas trabalhadas"), fmtMin(tot.reais)),
					numero(t("Horas a cobrar"), fmtMin(tot.cobrar)),
					numero(t("Valor"), fmtDinheiro(tot.valor)),
					numero(t("Taxa efetiva/hora"), fmtDinheiro(efetiva),
						preco ? (efetiva < preco ? t("abaixo do preço de referência ({0})", fmtDinheiro(preco)) : t("referência {0}", fmtDinheiro(preco))) : null,
						preco && efetiva < preco ? "tp-alerta" : "")),
				r.linhas.length ? h("div", { class: "tp-tabela-rola" }, h("table", { class: "tp-tabela" },
					h("thead", {}, h("tr", {}, [t("Cliente"), t("Acordo"), t("Trabalhadas"), t("A cobrar"), t("Ofertas"), t("Valor")].map((x, i) => h("th", { class: i > 1 ? "tp-num" : "" }, x)))),
					h("tbody", {}, r.linhas.map((l) => h("tr", {},
						h("td", {}, l.nome_cliente), h("td", {}, h("span", { class: "tp-cor", style: { background: l.cor || "var(--tp-acento)" } }), l.titulo, h("small", {}, " · " + t(l.tipo))),
						h("td", { class: "tp-num" }, fmtMin(l.minutos_reais)), h("td", { class: "tp-num" }, fmtMin(l.minutos_cobrar)),
						h("td", { class: "tp-num" }, l.minutos_oferta ? fmtMin(l.minutos_oferta) : ""), h("td", { class: "tp-num" }, fmtDinheiro(l.valor))))),
					h("tfoot", {}, h("tr", {}, h("th", { colspan: "2" }, t("Total")), h("td", { class: "tp-num" }, fmtMin(tot.reais)),
						h("td", { class: "tp-num" }, fmtMin(tot.cobrar)), h("td", { class: "tp-num" }, fmtMin(tot.oferta)), h("td", { class: "tp-num" }, h("b", {}, fmtDinheiro(tot.valor)))))))
					: h("p", { class: "tp-nada" }, t("Sem registos neste mês."))),
			Object.keys(r.saldos).length ? h("section", { class: "tp-cartao" }, h("h2", {}, t("Por faturar (todos os meses)")),
				h("ul", { class: "tp-lista" }, Object.entries(r.saldos).map(([c, s]) => h("li", { class: "tp-reg" },
					h("div", { class: "tp-reg-txt" }, h("b", {}, cliente(c).nome_cliente || c)),
					h("div", { class: "tp-reg-num" }, h("b", {}, fmtDinheiro(s.por_faturar))))))) : null,
		];
	}
	function numero(rotulo, valor, nota, classe) {
		return h("div", { class: "tp-numero " + (classe || "") }, h("small", {}, rotulo), h("b", {}, valor), nota ? h("span", {}, nota) : null);
	}

	// ── Preço/hora ─────────────────────────────────────────────────────────
	const CATEGORIAS = ["Contabilidade", "Software", "Comunicações", "Espaço", "Seguros", "Deslocações", "Formação", "Marketing", "Equipamento", "Banco e pagamentos", "Outros"];
	const NOMES_PARAMETROS = {
		ss_taxa: "Taxa da Segurança Social", ss_base: "Base de incidência da Segurança Social", irs_coef: "Coeficiente do regime simplificado",
		irs_taxa_media: "Taxa média de IRS", primeiro_ano: "1.º ano (isento de Segurança Social)", iva_taxa: "IVA",
		tsu_entidade: "TSU da empresa", tsu_trabalhador: "TSU do gerente", irc_taxa: "IRC", cuota_mensal: "Cuota de autónomos (€/mês)",
		irpf_taxa_media: "Taxa média de IRPF", is_taxa: "Impuesto de Sociedades", taxa_media: "Taxa média de impostos",
	};
	const NOMES_ENCARGOS = { seguranca_social: "Segurança Social", irs: "IRS", tsu_entidade: "TSU da empresa", tsu_trabalhador: "TSU do gerente",
		cuota_autonomos: "Cuota de autónomos", irpf: "IRPF", impostos: "Impostos" };

	function estudoNovo() {
		const d = S.definicoes || {};
		return {
			titulo: t("Estudo de {0}", new Date().getFullYear()), ano: new Date().getFullYear(),
			pais: d.pais || "PT", regime: d.regime || "PT_IND",
			despesas: [
				{ categoria: "Contabilidade", descricao: t("Contabilista / gestoria"), valor: "", periodicidade: "mensal" },
				{ categoria: "Software", descricao: t("Software e assinaturas"), valor: "", periodicidade: "mensal" },
				{ categoria: "Comunicações", descricao: t("Telemóvel e internet"), valor: "", periodicidade: "mensal" },
				{ categoria: "Espaço", descricao: t("Escritório / cowork / parte da casa"), valor: "", periodicidade: "mensal" },
				{ categoria: "Seguros", descricao: t("Seguro de responsabilidade civil"), valor: "", periodicidade: "anual" },
				{ categoria: "Equipamento", descricao: t("Computador"), valor: "", periodicidade: "amortizacao", anos: 3 },
				{ categoria: "Deslocações", descricao: t("Deslocações"), valor: "", periodicidade: "mensal" },
				{ categoria: "Formação", descricao: t("Formação"), valor: "", periodicidade: "anual" },
			],
			liquido_mensal: "", meses_rendimento: "12", horas_semana: 40, dias_semana: 5, dias_ferias: 22, dias_feriados: 13,
			dias_imprevistos: 5, dias_formacao: 5, pct_faturavel: 60, margem: 10, parametros_json: {},
			packs: [{ horas: 10, desconto: 5 }, { horas: 20, desconto: 10 }],
		};
	}

	let calcTimer = null;
	function recalcular() {
		clearTimeout(calcTimer);
		calcTimer = setTimeout(() => tentar(async () => {
			S.resultado = await api("calcular_estudo", { dados: S.estudo }, true);
			const alvo = document.getElementById("tp-resultado");
			if (alvo) alvo.replaceWith(painelResultado());
			// Os parâmetros só se redesenham quando muda o conjunto (regime, ano): redesenhá-los
			// a cada tecla tirava o cursor do campo que se está a escrever.
			const chaves = (((S.resultado || {}).parametros || {}).linhas || []).map((l) => l.chave).join(",");
			const par = document.getElementById("tp-parametros");
			if (par && par.dataset.chaves !== chaves) par.replaceWith(painelParametros());
		}), 250);
	}

	function vPreco() {
		if (!S.estudo) {
			return h("section", { class: "tp-cartao" },
				h("div", { class: "tp-cab" }, h("h2", {}, t("Estudo do preço/hora")),
					h("button", { class: "tp-btn tp-primario", onclick: () => { S.estudo = estudoNovo(); S.resultado = null; render(); recalcular(); } }, "+ " + t("Novo estudo"))),
				h("p", {}, t("Preencha as despesas mensais da sua estrutura, o rendimento que quer receber e o tempo que consegue faturar. A app diz o preço/hora mínimo e o recomendado.")),
				S.estudos.length ? h("ul", { class: "tp-lista" }, S.estudos.map((e) => h("li", { class: "tp-reg", tabindex: "0",
					onclick: () => abrirEstudo(e.name), onkeydown: (ev) => ev.key === "Enter" && abrirEstudo(e.name) },
					h("div", { class: "tp-reg-txt" }, h("b", {}, e.titulo, e.ativo ? h("small", { class: "tp-selo" }, t("em uso")) : null),
						h("span", {}, e.ano + " · " + (S.regimes[e.regime] || e.regime))),
					h("div", { class: "tp-reg-num" }, h("b", {}, fmtDinheiro(e.preco_recomendado) + "/h"), h("small", {}, t("mínimo {0}", fmtDinheiro(e.preco_minimo)))))))
					: h("p", { class: "tp-nada" }, t("Ainda não há estudos.")));
		}
		const E = S.estudo;
		const num = (chave, extra) => h("input", Object.assign({ class: "tp-campo", type: "number", step: "any", min: "0", value: E[chave] ?? "",
			oninput: (e) => { E[chave] = e.target.value; recalcular(); } }, extra || {}));
		const despesas = h("div", { class: "tp-despesas" },
			E.despesas.map((l, i) => h("div", { class: "tp-desp" },
				h("select", { class: "tp-campo", "aria-label": t("Categoria"), onchange: (e) => { l.categoria = e.target.value; } },
					CATEGORIAS.map((c) => h("option", { value: c, selected: l.categoria === c ? "selected" : null }, t(c)))),
				h("input", { class: "tp-campo", value: l.descricao || "", "aria-label": t("Descrição"), oninput: (e) => { l.descricao = e.target.value; } }),
				h("input", { class: "tp-campo tp-curto", type: "number", step: "any", min: "0", value: l.valor ?? "", placeholder: "0", "aria-label": t("Valor"),
					oninput: (e) => { l.valor = e.target.value; recalcular(); } }),
				h("select", { class: "tp-campo", "aria-label": t("Periodicidade"), onchange: (e) => { l.periodicidade = e.target.value; if (e.target.value === "amortizacao" && !l.anos) l.anos = 3; render(); recalcular(); } },
					[["mensal", t("por mês")], ["anual", t("por ano")], ["amortizacao", t("compra, em anos")]].map(([v, r]) =>
						h("option", { value: v, selected: l.periodicidade === v ? "selected" : null }, r))),
				l.periodicidade === "amortizacao" ? h("input", { class: "tp-campo tp-mini", type: "number", min: "1", step: "1", value: l.anos || 3, "aria-label": t("Anos"),
					oninput: (e) => { l.anos = e.target.value; recalcular(); } }) : h("span", { class: "tp-mini" }),
				h("button", { class: "tp-btn tp-discreto", type: "button", "aria-label": t("Retirar"), onclick: () => { E.despesas.splice(i, 1); render(); recalcular(); } }, "×"))),
			h("button", { class: "tp-btn", type: "button", onclick: () => { E.despesas.push({ categoria: "Outros", descricao: "", valor: "", periodicidade: "mensal" }); render(); } }, "+ " + t("Despesa")));

		const parametros = painelParametros();

		return h("div", { class: "tp-estudo" },
			h("section", { class: "tp-cartao" },
				h("div", { class: "tp-cab" },
					h("button", { class: "tp-btn", onclick: () => { S.estudo = null; S.resultado = null; carregarEstudos(); } }, "‹ " + t("Estudos")),
					h("input", { class: "tp-campo tp-titulo", value: E.titulo || "", "aria-label": t("Título"), oninput: (e) => { E.titulo = e.target.value; } })),
				h("div", { class: "tp-duas" },
					campo(t("Regime fiscal"), h("select", { class: "tp-campo", onchange: (e) => { E.regime = e.target.value; E.pais = e.target.value.slice(0, 2) === "PT" ? "PT" : e.target.value.slice(0, 2) === "ES" ? "ES" : "Outro"; E.parametros_json = {}; recalcular(); } },
						Object.entries(S.regimes || {}).map(([k, v]) => h("option", { value: k, selected: E.regime === k ? "selected" : null }, t(v))))),
					campo(t("Ano"), num("ano", { min: "2020", step: "1" })))),
			h("section", { class: "tp-cartao" }, h("h2", {}, "1. " + t("Despesas da estrutura")),
				h("p", { class: "tp-ajuda" }, t("Tudo o que paga para poder trabalhar, mesmo sem clientes. Compras grandes (computador, carro) entram divididas pelos anos de uso.")),
				despesas),
			h("section", { class: "tp-cartao" }, h("h2", {}, "2. " + t("Rendimento que quer receber")),
				h("div", { class: "tp-duas" },
					campo(t("Líquido por mês"), num("liquido_mensal"), t("O que quer que lhe fique no bolso, depois de impostos e contribuições.")),
					campo(t("Meses por ano"), h("select", { class: "tp-campo", onchange: (e) => { E.meses_rendimento = e.target.value; recalcular(); } },
						[["12", t("12 meses")], ["14", t("14 meses (como subsídios de férias e Natal)")]].map(([v, r]) =>
							h("option", { value: v, selected: String(E.meses_rendimento) === v ? "selected" : null }, r)))))),
			h("section", { class: "tp-cartao" }, h("h2", {}, "3. " + t("Tempo")),
				h("div", { class: "tp-tres" },
					campo(t("Horas por semana"), num("horas_semana")), campo(t("Dias por semana"), num("dias_semana")),
					campo(t("Tempo faturável (%)"), num("pct_faturavel", { max: "100" }), t("Comercial, propostas, administração e formação não se faturam. Entre 55 % e 70 % é o habitual."))),
				h("div", { class: "tp-quatro" },
					campo(t("Férias (dias)"), num("dias_ferias")), campo(t("Feriados (dias)"), num("dias_feriados")),
					campo(t("Doença e imprevistos (dias)"), num("dias_imprevistos")), campo(t("Formação (dias)"), num("dias_formacao")))),
			h("section", { class: "tp-cartao" }, h("h2", {}, "4. " + t("Impostos e contribuições")),
				h("p", { class: "tp-ajuda" }, t("Valores de referência do ano. Confirme-os com o seu contabilista ou gestoria; pode ajustá-los ao seu caso.")),
				parametros),
			h("section", { class: "tp-cartao" }, h("h2", {}, "5. " + t("Margem e packs")),
				h("div", { class: "tp-duas" }, campo(t("Margem (%)"), num("margem"), t("Para reinvestir e aguentar meses fracos."))),
				h("h3", {}, t("Packs a testar")),
				h("div", { class: "tp-packs" },
					E.packs.map((p, i) => h("div", { class: "tp-pack-in" },
						h("input", { class: "tp-campo tp-mini", type: "number", min: "1", value: p.horas, "aria-label": t("Horas"), oninput: (e) => { p.horas = Number(e.target.value); recalcular(); } }), h("span", {}, t("h com")),
						h("input", { class: "tp-campo tp-mini", type: "number", min: "0", max: "90", value: p.desconto, "aria-label": t("Desconto"), oninput: (e) => { p.desconto = Number(e.target.value); recalcular(); } }), h("span", {}, t("% de desconto")),
						h("button", { class: "tp-btn tp-discreto", type: "button", onclick: () => { E.packs.splice(i, 1); render(); recalcular(); } }, "×"))),
					h("button", { class: "tp-btn", type: "button", onclick: () => { E.packs.push({ horas: 40, desconto: 15 }); render(); recalcular(); } }, "+ " + t("Pack")))),
			painelResultado(),
			h("div", { class: "tp-botoes tp-fixos" },
				h("button", { class: "tp-btn", onclick: () => guardarEstudo(0) }, t("Guardar")),
				h("button", { class: "tp-btn tp-primario", onclick: () => guardarEstudo(1) }, t("Guardar e usar este preço"))));
	}

	function painelParametros() {
		const E = S.estudo;
		const linhasPar = (((S.resultado || {}).parametros || {}).linhas) || [];
		const proprios = E.parametros_json || (E.parametros_json = {});
		return h("div", { class: "tp-parametros", id: "tp-parametros", "data-chaves": linhasPar.map((l) => l.chave).join(",") },
			linhasPar.map((p) => {
				// As frações mostram-se em percentagem (21,4 e não 0,214); guardam-se como fração.
				const f = p.unidade === "fração" ? 100 : 1;
				const atual = proprios[p.chave] ?? p.valor;
				return h("label", { class: "tp-par" },
				h("span", {}, t(NOMES_PARAMETROS[p.chave] || p.chave) + (f === 100 ? " (%)" : ""), " ",
					p.validado ? h("small", { class: "tp-selo tp-ok" }, t("validado")) : h("small", { class: "tp-selo tp-por" }, t("por validar"))),
				h("input", { class: "tp-campo tp-curto", type: "number", step: "any", value: Math.round(Number(atual) * f * 10000) / 10000,
					oninput: (e) => {
						const v = e.target.value === "" ? null : Number(e.target.value) / f;
						if (v === null || Math.abs(v - p.valor) < 1e-9) delete proprios[p.chave]; else proprios[p.chave] = v;
						recalcular();
					} }),
				h("small", { class: "tp-ajuda" }, (p.descricao || "") + (p.fonte ? " — " + p.fonte : "")));
			}));
	}

	function painelResultado() {
		const r = S.resultado;
		if (!r) return h("section", { id: "tp-resultado", class: "tp-cartao tp-resultado" }, h("p", { class: "tp-nada" }, t("A calcular…")));
		if (r.erro) return h("section", { id: "tp-resultado", class: "tp-cartao tp-resultado" }, h("p", { class: "tp-alerta" }, r.erro));
		const avisos = (r.avisos || []).map((a) => h("p", { class: "tp-alerta" },
			a.tipo === "parametros_em_falta" ? t("Faltam parâmetros fiscais para este regime: {0}.", a.campos.map((c) => t(NOMES_PARAMETROS[c] || c)).join(", ")) :
			a.tipo === "sem_horas_faturaveis" ? t("Sem horas faturáveis não há preço possível.") :
			a.tipo === "pct_faturavel_alta" ? t("Mais de 75 % de tempo faturável é raro. Confirme se é realista.") : a.tipo));
		const p = r.parametros || {};
		if (p.ano_usado && p.ano_usado !== Number(p.ano_pedido)) avisos.push(h("p", { class: "tp-alerta" }, t("Ainda não há parâmetros de {0}; usam-se os de {1}.", p.ano_pedido, p.ano_usado)));
		if (!p.validados) avisos.push(h("p", { class: "tp-nota" }, t("Estimativa: os parâmetros fiscais ainda não foram validados por um contabilista.")));
		const sens = r.sensibilidade;
		return h("section", { id: "tp-resultado", class: "tp-cartao tp-resultado", "aria-live": "polite" },
			h("h2", {}, t("Resultado")),
			h("div", { class: "tp-numeros tp-tres-grandes" },
				numero(t("Custo da estrutura/hora"), r.custo_estrutura_hora != null ? fmtDinheiro(r.custo_estrutura_hora) : "—", t("só para manter a atividade aberta")),
				numero(t("Preço mínimo"), r.preco_minimo != null ? fmtDinheiro(r.preco_minimo) : "—", t("abaixo disto não chega ao rendimento")),
				numero(t("Preço recomendado"), r.preco_recomendado != null ? fmtDinheiro(r.preco_recomendado) : "—",
					r.preco_recomendado_com_iva ? t("{0} com IVA", fmtDinheiro(r.preco_recomendado_com_iva)) : t("sem IVA"), "tp-destaque")),
			avisos,
			h("dl", { class: "tp-detalhe" },
				dl(t("Despesas por ano"), fmtDinheiro(r.despesas_anuais)),
				dl(t("Rendimento líquido por ano"), fmtDinheiro(r.liquido_anual)),
				Object.entries(r.encargos || {}).map(([k, v]) => dl(t(NOMES_ENCARGOS[k] || k), fmtDinheiro(v))),
				dl(t("Faturação mínima por ano"), fmtDinheiro(r.faturacao_minima)),
				dl(t("Faturação recomendada por ano"), fmtDinheiro(r.faturacao_recomendada)),
				r.imposto_lucros != null ? dl(t("Imposto sobre o lucro da margem"), fmtDinheiro(r.imposto_lucros)) : null,
				dl(t("Horas disponíveis por ano"), fmtNum(r.horas_disponiveis, 0)),
				dl(t("Horas faturáveis por ano"), fmtNum(r.horas_faturaveis, 0))),
			r.packs ? h("div", {}, h("h3", {}, t("Packs")),
				h("ul", { class: "tp-lista" }, r.packs.map((pk) => h("li", { class: "tp-reg" + (pk.abaixo_minimo ? " tp-alerta-linha" : "") },
					h("div", { class: "tp-reg-txt" }, h("b", {}, t("{0} h com {1} %", pk.horas, fmtNum(pk.desconto, 0))),
						h("span", {}, pk.abaixo_minimo ? "⚠ " + t("abaixo do preço mínimo") : "✓ " + t("acima do preço mínimo"))),
					h("div", { class: "tp-reg-num" }, h("b", {}, fmtDinheiro(pk.total)), h("small", {}, fmtDinheiro(pk.preco_hora_efetivo) + "/h"))))),
				h("p", { class: "tp-ajuda" }, t("Desconto máximo sem descer do preço mínimo: {0} %.", fmtNum(r.desconto_maximo)))) : null,
			sens ? h("details", { class: "tp-sens" }, h("summary", {}, t("E se trabalhar mais ou menos horas?")),
				h("div", { class: "tp-tabela-rola" }, h("table", { class: "tp-tabela" },
					h("thead", {}, h("tr", {}, h("th", {}, t("Faturável")), sens.horas_semana.map((x) => h("th", { class: "tp-num" }, t("{0} h/semana", x))))),
					h("tbody", {}, sens.linhas.map((l) => h("tr", {}, h("th", {}, l.pct_faturavel + " %"),
						l.precos.map((v) => h("td", { class: "tp-num" }, v != null ? fmtDinheiro(v) : "—")))))))) : null);
	}
	function dl(a, b) { return [h("dt", {}, a), h("dd", {}, b)]; }

	async function abrirEstudo(nome) {
		await tentar(async () => {
			const e = await api("estudo", { nome });
			e.packs = [{ horas: 10, desconto: 5 }, { horas: 20, desconto: 10 }];
			S.estudo = e; S.resultado = null; render(); recalcular();
		});
	}
	async function guardarEstudo(usar) {
		await tentar(async () => {
			const e = await api("guardar_estudo", { dados: S.estudo, usar }, true);
			S.estudo = Object.assign(e, { packs: S.estudo.packs });
			if (usar) { const a = await api("arranque"); S.definicoes = a.definicoes; await carregarDados(); }
			aviso(usar ? t("Estudo guardado. O preço recomendado passa a ser o preço/hora por omissão.") : t("Estudo guardado."));
			render(); recalcular();
		});
	}

	// ── Definições ─────────────────────────────────────────────────────────
	function vDefinicoes() {
		const d = S.definicoes || {};
		const f = {
			nome_comercial: h("input", { class: "tp-campo", value: d.nome_comercial || "" }),
			cor: h("input", { class: "tp-campo tp-cor-in", type: "color", value: d.cor || "#b20009" }),
			moeda: h("select", { class: "tp-campo" }, ["EUR", "USD", "GBP", "BRL", "CHF"].map((m) => h("option", { value: m, selected: (d.moeda || "EUR") === m ? "selected" : null }, m))),
			preco_hora: h("input", { class: "tp-campo", type: "number", step: "0.01", min: "0", value: d.preco_hora || "" }),
			arredondamento_bloco: h("input", { class: "tp-campo", type: "number", min: "0", step: "1", value: d.arredondamento_bloco ?? 15 }),
			arredondamento_modo: h("select", { class: "tp-campo" }, [["cima", t("Para cima")], ["proximo", t("Ao mais próximo")]].map(([v, r]) =>
				h("option", { value: v, selected: (d.arredondamento_modo || "cima") === v ? "selected" : null }, r))),
			minimo_minutos: h("input", { class: "tp-campo", type: "number", min: "0", step: "1", value: d.minimo_minutos || 0 }),
		};
		return h("section", { class: "tp-cartao" },
			h("h2", {}, t("Definições")),
			h("form", { onsubmit: (e) => { e.preventDefault(); tentar(async () => {
				S.definicoes = await api("guardar_definicoes", { dados: { nome_comercial: f.nome_comercial.value, cor: f.cor.value, moeda: f.moeda.value,
					preco_hora: f.preco_hora.value, arredondamento_bloco: f.arredondamento_bloco.value, arredondamento_modo: f.arredondamento_modo.value,
					minimo_minutos: f.minimo_minutos.value } }, true);
				await carregarDados(); render(); aviso(t("Definições guardadas."));
			}); } },
				h("div", { class: "tp-duas" }, campo(t("Nome comercial"), f.nome_comercial, t("Como aparece aos seus clientes.")), campo(t("Cor"), f.cor)),
				h("div", { class: "tp-duas" }, campo(t("Moeda"), f.moeda),
					campo(t("Preço/hora por omissão"), f.preco_hora, d.estudo_ativo ? t("Vem do estudo em uso ({0}).", d.estudo_ativo) : t("Faça o estudo do preço/hora para o calcular."))),
				h("h3", {}, t("Arredondamento por omissão")),
				h("div", { class: "tp-tres" }, campo(t("Bloco (min)"), f.arredondamento_bloco, t("0 = ao minuto")), campo(t("Arredondar"), f.arredondamento_modo), campo(t("Mínimo (min)"), f.minimo_minutos)),
				h("div", { class: "tp-botoes" }, h("button", { class: "tp-btn tp-primario", type: "submit" }, t("Guardar")))));
	}

	// ── carregamentos ──────────────────────────────────────────────────────
	async function carregarDados() {
		const d = await api("dados");
		S.clientes = d.clientes; S.acordos = d.acordos;
	}
	async function carregarHoje() {
		const hoje = isoData(new Date());
		S.registosHoje = await api("registos", { desde: hoje, ate: hoje });
		render();
	}
	async function carregarSemana() {
		S.registosSemana = await api("registos", { desde: isoData(S.semana), ate: isoData(somaDias(S.semana, 6)) });
		render();
	}
	async function carregarResumo() {
		S.resumo = null; render();
		S.resumo = await api("resumo", { mes: S.mes });
		render();
	}
	async function carregarEstudos() {
		S.estudos = await api("estudos");
		render();
	}
	function recarregarVista() {
		return tentar(async () => {
			S.cronometro = await api("cronometro");
			if (S.vista === "hoje") return carregarHoje();
			if (S.vista === "semana") return carregarSemana();
			if (S.vista === "resumo") return carregarResumo();
			render();
		});
	}

	function irPara() {
		const v = (location.hash.replace(/^#\/?/, "") || "hoje").split("/")[0];
		S.vista = VISTAS.some(([id]) => id === v) ? v : "hoje";
		if (S.vista !== "preco") { S.estudo = null; S.resultado = null; }
		if (S.vista === "preco") return tentar(carregarEstudos);
		if (S.vista === "clientes" || S.vista === "definicoes") return render();
		recarregarVista();
	}

	async function arrancar() {
		try {
			const a = await api("arranque");
			S.definicoes = a.definicoes; S.clientes = a.clientes; S.acordos = a.acordos;
			S.cronometro = a.cronometro; S.regimes = a.regimes;
			S.agoraServidor = a.agora; S.agoraLocal = Date.now();
			BOOT.hoje = a.hoje;
		} catch (e) {
			raiz.replaceChildren(h("div", { class: "tp-cartao tp-erro-geral" }, h("p", {}, e.message), h("a", { href: "/app" }, t("Voltar ao Orbit"))));
			return;
		}
		window.addEventListener("hashchange", irPara);
		// Voltar ao separador depois de horas: o cronómetro pode ter sido parado noutro aparelho.
		document.addEventListener("visibilitychange", () => { if (!document.hidden) recarregarVista(); });
		irPara();
	}

	arrancar();
})();
