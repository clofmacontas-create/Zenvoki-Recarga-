document
  .getElementById("loginForm")
  .addEventListener("submit", async function (event) {

    event.preventDefault();

    const usuario =
      document.getElementById("usuario").value.trim();

    const senha =
      document.getElementById("senha").value;

    const mensagem =
      document.getElementById("mensagem");

    const botao =
      this.querySelector("button[type='submit']");

    botao.disabled = true;
    botao.textContent = "⏳ Entrando...";

    mensagem.textContent = "";

    try {

      const resposta = await fetch("/api/admin/login", {
        method: "POST",

        headers: {
          "Content-Type": "application/json"
        },

        body: JSON.stringify({
          login: usuario,
          senha: senha
        })
      });

      const dados = await resposta.json();

      if (!resposta.ok) {
        throw new Error(
          dados.error || "Não foi possível entrar."
        );
      }

      mensagem.style.color = "#4ade80";
      mensagem.textContent =
        "✅ Acesso autorizado!";

      setTimeout(() => {
        window.location.href = "/admin/dashboard.html";
      }, 500);

    } catch (erro) {

      mensagem.style.color = "#ff6b6b";
      mensagem.textContent =
        "❌ " + erro.message;

      botao.disabled = false;
      botao.textContent = "🔐 Entrar no painel";
    }
  });
