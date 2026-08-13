require("dotenv").config();

const express = require("express");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, "db.json");

// =========================
// BANCO DE DADOS
// =========================

function carregarDB() {
  if (!fs.existsSync(DB_FILE)) {
    const dbInicial = {
      users: [],
      orders: [],
      rechargeMode: "sem_codigo",
      recharges: {}
    };

    salvarDB(dbInicial);

    return dbInicial;
  }

  let db;

  try {
    db = JSON.parse(
      fs.readFileSync(DB_FILE, "utf8")
    );
  } catch (error) {
    console.error("Erro ao ler db.json:", error);

    db = {
      users: [],
      orders: [],
      rechargeMode: "sem_codigo",
      recharges: {}
    };
  }

  db.users = Array.isArray(db.users)
    ? db.users
    : [];

  db.orders = Array.isArray(db.orders)
    ? db.orders
    : [];

  if (
    !db.rechargeMode ||
    !["sem_codigo", "com_codigo"].includes(
      db.rechargeMode
    )
  ) {
    db.rechargeMode = "sem_codigo";
  }

  if (
    !db.recharges ||
    typeof db.recharges !== "object"
  ) {
    db.recharges = {};
  }

  return db;
}

function salvarDB(db) {
  fs.writeFileSync(
    DB_FILE,
    JSON.stringify(db, null, 2)
  );
}

// =========================
// CONFIGURAÇÕES DE RECARGA
// =========================

function garantirConfiguracoesRecarga() {
  const db = carregarDB();

  const configuracoes = {
    CLARO: {
      "20": {
        preco: 13,
        ativo: true
      },
      "25": {
        preco: 15,
        ativo: true
      },
      "30": {
        preco: 18,
        ativo: true
      },
      "35": {
        preco: 20,
        ativo: true
      },
      "40": {
        preco: 23,
        ativo: true
      },
      "50": {
        preco: 28,
        ativo: true
      },
      "60": {
        preco: 33,
        ativo: true
      },
      "70": {
        preco: 37,
        ativo: true
      }
    },

    TIM: {
      "15": {
        preco: 9.5,
        ativo: true
      },
      "20": {
        preco: 13,
        ativo: true
      },
      "30": {
        preco: 18,
        ativo: true
      },
      "40": {
        preco: 23,
        ativo: true
      },
      "50": {
        preco: 28,
        ativo: true
      },
      "60": {
        preco: 33,
        ativo: true
      },
      "100": {
        preco: 40,
        ativo: true
      }
    }
  };

  let alterou = false;

  for (const operadora of Object.keys(configuracoes)) {
    if (!db.recharges[operadora]) {
      db.recharges[operadora] =
        configuracoes[operadora];

      alterou = true;
      continue;
    }

    for (const recarga of Object.keys(
      configuracoes[operadora]
    )) {
      if (
        typeof db.recharges[operadora][recarga] ===
        "undefined"
      ) {
        db.recharges[operadora][recarga] =
          configuracoes[operadora][recarga];

        alterou = true;
      }
    }
  }

  if (alterou) {
    salvarDB(db);
  }

  return db.recharges;
}

// Garante as configurações logo ao iniciar.
garantirConfiguracoesRecarga();

// =========================
// EXPRESS
// =========================

app.use(express.json());

app.use(
  express.urlencoded({
    extended: true
  })
);

// =========================
// SESSÃO
// =========================

app.use(
  session({
    secret:
      process.env.SESSION_SECRET ||
      "troque-esta-chave",

    resave: false,

    saveUninitialized: false,

    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: false,

      maxAge:
        1000 *
        60 *
        60 *
        24 *
        7
    }
  })
);

// =========================
// ARQUIVOS DO SITE
// =========================

app.use(
  express.static(
    path.join(
      __dirname,
      "public"
    )
  )
);

// =========================
// PROTEÇÃO ADMIN
// =========================

function exigirAdmin(
  req,
  res,
  next
) {
  if (
    req.session.admin !== true
  ) {
    return res.status(401).json({
      error:
        "Acesso administrativo não autorizado."
    });
  }

  next();
}

// =========================
// CADASTRO
// =========================

app.post(
  "/api/register",
  async (req, res) => {
    try {
      const {
        nome,
        username,
        email,
        senha
      } = req.body;

      if (
        !nome ||
        !username ||
        !email ||
        !senha
      ) {
        return res.status(400).json({
          error:
            "Preencha todos os campos."
        });
      }

      if (senha.length < 6) {
        return res.status(400).json({
          error:
            "A senha precisa ter pelo menos 6 caracteres."
        });
      }

      const db = carregarDB();

      const usernameNormalizado =
        String(username).trim();

      const emailNormalizado =
        String(email)
          .trim()
          .toLowerCase();

      const usernameExiste =
        db.users.some(
          user =>
            String(user.username)
              .toLowerCase() ===
            usernameNormalizado.toLowerCase()
        );

      if (usernameExiste) {
        return res.status(409).json({
          error:
            "Nome de usuário já está sendo usado."
        });
      }

      const emailExiste =
        db.users.some(
          user =>
            String(user.email)
              .toLowerCase() ===
            emailNormalizado
        );

      if (emailExiste) {
        return res.status(409).json({
          error:
            "E-mail já está cadastrado."
        });
      }

      const senhaHash =
        await bcrypt.hash(
          senha,
          12
        );

      const novoUsuario = {
        id:
          Date.now().toString(),

        nome:
          String(nome).trim(),

        username:
          usernameNormalizado,

        email:
          emailNormalizado,

        senha:
          senhaHash,

        criadoEm:
          new Date().toISOString()
      };

      db.users.push(
        novoUsuario
      );

      salvarDB(db);

      req.session.userId =
        novoUsuario.id;

      res.status(201).json({
        success: true,

        message:
          "Conta criada com sucesso.",

        user: {
          id:
            novoUsuario.id,

          nome:
            novoUsuario.nome,

          username:
            novoUsuario.username,

          email:
            novoUsuario.email
        }
      });

    } catch (error) {
      console.error(
        "Erro no cadastro:",
        error
      );

      res.status(500).json({
        error:
          "Erro interno ao criar a conta."
      });
    }
  }
);

// =========================
// LOGIN CLIENTE
// =========================

app.post(
  "/api/login",
  async (req, res) => {
    try {
      const {
        login,
        senha
      } = req.body;

      if (
        !login ||
        !senha
      ) {
        return res.status(400).json({
          error:
            "Informe usuário/e-mail e senha."
        });
      }

      const db =
        carregarDB();

      const loginNormalizado =
        String(login)
          .trim()
          .toLowerCase();

      const usuario =
        db.users.find(
          user =>
            String(user.username)
              .toLowerCase() ===
              loginNormalizado ||

            String(user.email)
              .toLowerCase() ===
              loginNormalizado
        );

      if (!usuario) {
        return res.status(401).json({
          error:
            "Usuário ou senha incorretos."
        });
      }

      const senhaValida =
        await bcrypt.compare(
          senha,
          usuario.senha
        );

      if (!senhaValida) {
        return res.status(401).json({
          error:
            "Usuário ou senha incorretos."
        });
      }

      req.session.userId =
        usuario.id;

      res.json({
        success: true,

        message:
          "Login realizado com sucesso.",

        user: {
          id:
            usuario.id,

          nome:
            usuario.nome,

          username:
            usuario.username,

          email:
            usuario.email
        }
      });

    } catch (error) {
      console.error(
        "Erro no login:",
        error
      );

      res.status(500).json({
        error:
          "Erro interno ao realizar login."
      });
    }
  }
);

// =========================
// LOGOUT CLIENTE
// =========================

app.post(
  "/api/logout",
  (req, res) => {
    req.session.destroy(
      error => {
        if (error) {
          return res.status(500).json({
            error:
              "Não foi possível sair."
          });
        }

        res.clearCookie(
          "connect.sid"
        );

        res.json({
          success: true
        });
      }
    );
  }
);

// =========================
// LOGIN ADMIN
// =========================

app.post(
  "/api/admin/login",
  (req, res) => {
    try {
      const {
        login,
        senha
      } = req.body;

      if (
        !login ||
        !senha
      ) {
        return res.status(400).json({
          error:
            "Informe usuário e senha."
        });
      }

      if (
        login !==
          process.env.ADMIN_USER ||
        senha !==
          process.env.ADMIN_PASSWORD
      ) {
        return res.status(401).json({
          error:
            "Usuário ou senha do administrador incorretos."
        });
      }

      req.session.admin =
        true;

      res.json({
        success: true,

        message:
          "Login administrativo realizado."
      });

    } catch (error) {
      console.error(
        "Erro no login admin:",
        error
      );

      res.status(500).json({
        error:
          "Erro interno no login."
      });
    }
  }
);

// =========================
// LOGOUT ADMIN
// =========================

app.post(
  "/api/admin/logout",
  (req, res) => {
    req.session.admin =
      false;

    res.json({
      success: true
    });
  }
);

// =========================
// VERIFICAR ADMIN
// =========================

  "/api/admin/recharge-mode",app.get(
  "/api/admin/me",
  (req, res) => {
    if (
      req.session.admin !== true
    ) {
      return res.status(401).json({
        authenticated:
          false
      });
    }

    res.json({
      authenticated:
        true,

      admin:
        true
    });
  }
);

// =========================
// DADOS DO CLIENTE
// =========================

app.get(
  "/api/me",
  (req, res) => {
    if (
      !req.session.userId
    ) {
      return res.status(401).json({
        authenticated:
          false
      });
    }

    const db =
      carregarDB();

    const usuario =
      db.users.find(
        user =>
          user.id ===
          req.session.userId
      );

    if (!usuario) {
      req.session.destroy(
        () => {}
      );

      return res.status(401).json({
        authenticated:
          false
      });
    }

    res.json({
      authenticated:
        true,

      user: {
        id:
          usuario.id,

        nome:
          usuario.nome,

        username:
          usuario.username,

        email:
          usuario.email,

        criadoEm:
          usuario.criadoEm
      }
    });
  }
);

// =========================
// STATUS
// =========================

app.get(
  "/api/status",
  (req, res) => {
    res.json({
      online: true,
      sistema:
        "Zenvoki Recarga"
    });
  }
);

// =========================
// CLIENTE - CONFIGURAÇÕES
// =========================

app.get(
  "/api/recharges",
  (req, res) => {
    try {
      garantirConfiguracoesRecarga();

      const db =
        carregarDB();

      res.json({
        success: true,

        recharges:
          db.recharges || {}
      });

    } catch (error) {
      console.error(
        "Erro ao carregar recargas:",
        error
      );

      res.status(500).json({
        error:
          "Não foi possível carregar as recargas."
      });
    }
  }
);

// =========================
// ADMIN - MODO DE RECARGA
// =========================

// =========================
// CLIENTE - MODO DA RECARGA
// =========================

app.get(
  "/api/recharge-mode",
  (req, res) => {

    try {

      const db =
        carregarDB();

      res.json({

        success: true,

        modoRecarga:
          db.rechargeMode ||
          "sem_codigo"

      });

    } catch (error) {

      console.error(
        "Erro ao consultar modo da recarga:",
        error
      );

      res.status(500).json({

        error:
          "Não foi possível consultar o modo da recarga."

      });

    }

  }
);
app.get(
  "/api/admin/recharge-mode",
  exigirAdmin,
  (req, res) => {
    try {
      const db =
        carregarDB();

      res.json({
        success: true,

        modoRecarga:
          db.rechargeMode ||
          "sem_codigo"
      });

    } catch (error) {
      console.error(
        "Erro ao carregar modo de recarga:",
        error
      );

      res.status(500).json({
        error:
          "Não foi possível carregar o modo de recarga."
      });
    }
  }
);

app.post(
  "/api/admin/recharge-mode",
  exigirAdmin,
  (req, res) => {
    try {
      const {
        modoRecarga
      } = req.body;

      const modosPermitidos = [
        "sem_codigo",
        "com_codigo"
      ];

      if (
        !modosPermitidos.includes(
          modoRecarga
        )
      ) {
        return res.status(400).json({
          error:
            "Modo de recarga inválido."
        });
      }

      const db =
        carregarDB();

      db.rechargeMode =
        modoRecarga;

      salvarDB(db);

      res.json({
        success: true,

        modoRecarga,

        message:
          modoRecarga ===
          "com_codigo"
            ? "Recarga com código ativada."
            : "Recarga sem código ativada."
      });

    } catch (error) {
      console.error(
        "Erro ao alterar modo de recarga:",
        error
      );

      res.status(500).json({
        error:
          "Não foi possível alterar o modo de recarga."
      });
    }
  }
);

// =========================
// ADMIN - CONFIGURAÇÕES
// =========================

app.get(
  "/api/admin/recharges",
  exigirAdmin,
  (req, res) => {
    try {
      garantirConfiguracoesRecarga();

      const db =
        carregarDB();

      res.json({
        success: true,

        recharges:
          db.recharges || {}
      });

    } catch (error) {
      console.error(
        "Erro ao carregar configurações:",
        error
      );

      res.status(500).json({
        error:
          "Não foi possível carregar as configurações."
      });
    }
  }
);

// =========================
// ADMIN - ALTERAR PREÇO / ATIVO
// =========================

app.post(
  "/api/admin/recharges",
  exigirAdmin,
  (req, res) => {
    try {
      const {
        operadora,
        recarga,
        preco,
        ativo
      } = req.body;

      if (
        !operadora ||
        !recarga ||
        typeof preco !== "number" ||
        !Number.isFinite(preco) ||
        preco <= 0 ||
        typeof ativo !== "boolean"
      ) {
        return res.status(400).json({
          error:
            "Dados da recarga inválidos."
        });
      }

      garantirConfiguracoesRecarga();

      const db =
        carregarDB();

      if (
        !db.recharges[operadora]
      ) {
        return res.status(404).json({
          error:
            "Operadora não encontrada."
        });
      }

      if (
        typeof db.recharges[operadora][recarga] ===
        "undefined"
      ) {
        return res.status(404).json({
          error:
            "Valor de recarga não encontrado."
        });
      }

      db.recharges[operadora][recarga] = {
        preco:
          Number(
            preco.toFixed(2)
          ),

        ativo
      };

      salvarDB(db);

      res.json({
        success: true,

        message:
          "Configuração salva com sucesso.",

        recharges:
          db.recharges
      });

    } catch (error) {
      console.error(
        "Erro ao salvar configuração:",
        error
      );

      res.status(500).json({
        error:
          "Não foi possível salvar a configuração."
      });
    }
  }
);

// =========================
// ADMIN - ESTATÍSTICAS
// =========================

app.get(
  "/api/admin/stats",
  exigirAdmin,
  (req, res) => {
    try {
      const db =
        carregarDB();

      const pedidos =
        db.orders || [];

      const clientes =
        db.users || [];

      const stats = {
        totalPedidos:
          pedidos.length,

        pedidosPendentes:
          pedidos.filter(
            pedido =>
              pedido.status ===
              "pending"
          ).length,

        pedidosPagos:
          pedidos.filter(
            pedido =>
              pedido.status ===
              "paid"
          ).length,

        pedidosFinalizados:
          pedidos.filter(
            pedido =>
              pedido.status ===
              "completed"
          ).length,

        pedidosCancelados:
          pedidos.filter(
            pedido =>
              pedido.status ===
              "cancelled"
          ).length,

        totalClientes:
          clientes.length
      };

      res.json({
        success: true,
        stats
      });

    } catch (error) {
      console.error(
        "Erro nas estatísticas:",
        error
      );

      res.status(500).json({
        error:
          "Não foi possível carregar as estatísticas."
      });
    }
  }
);

// =========================
// ADMIN - LISTAR PEDIDOS
// =========================

app.get(
  "/api/admin/orders",
  exigirAdmin,
  (req, res) => {
    try {
      const db =
        carregarDB();

      const pedidos =
        db.orders || [];

      res.json({
        success: true,

        total:
          pedidos.length,

        orders:
          pedidos
      });

    } catch (error) {
      console.error(
        "Erro ao carregar pedidos:",
        error
      );

      res.status(500).json({
        error:
          "Não foi possível carregar os pedidos."
      });
    }
  }
);

// =========================
// ADMIN - FINALIZAR / CANCELAR
// =========================

app.post(
  "/api/admin/orders/:id/status",
  exigirAdmin,
  (req, res) => {
    try {
      const {
        id
      } = req.params;

      const {
        status
      } = req.body;

      const statusPermitidos = [
        "completed",
        "cancelled"
      ];

      if (
        !statusPermitidos.includes(
          status
        )
      ) {
        return res.status(400).json({
          error:
            "Status inválido."
        });
      }

      const db =
        carregarDB();

      const pedido =
        db.orders.find(
          order =>
            order.id ===
            id
        );

      if (!pedido) {
        return res.status(404).json({
          error:
            "Pedido não encontrado."
        });
      }

      pedido.status =
        status;

      pedido.atualizadoEm =
        new Date().toISOString();

      salvarDB(db);

      res.json({
        success: true,

        message:
          status ===
          "completed"
            ? "Pedido finalizado com sucesso."
            : "Pedido cancelado com sucesso.",

        order:
          pedido
      });

    } catch (error) {
      console.error(
        "Erro ao atualizar pedido:",
        error
      );

      res.status(500).json({
        error:
          "Não foi possível atualizar o pedido."
      });
    }
  }
);

// =========================
// CLIENTE - CONSULTAR PEDIDO
// =========================

app.get(
  "/api/orders/:id",
  (req, res) => {
    try {
      const {
        id
      } = req.params;

      const db =
        carregarDB();

      const pedido =
        db.orders.find(
          order =>
            order.id === id
        );
// =========================
// SERVIDOR
// =========================

app.listen(
  PORT,
  () => {
    console.log(
      `🚀 Zenvoki Recarga rodando em http://localhost:${PORT}`
    );
  }
);
      if (!pedido) {
        return res.status(404).json({
          error:
            "Pedido não encontrado."
        });
      }

      if (
        pedido.usuarioId &&
        pedido.usuarioId !==
          req.session.userId &&
        req.session.admin !== true
      ) {
        return res.status(403).json({
          error:
            "Você não tem acesso a este pedido."
        });
      }

      res.json({
        success: true,

        order:
         pedido
      });

    } catch (error) {

      console.error(
        "Erro ao consultar pedido:",
        error
      );

      res.status(500).json({

        error:
          "Não foi possível consultar o pedido."

      });

    }

  }

);     


// =========================
// SERVIDOR
// =========================

app.listen(
  PORT,
  () => {
    console.log(
      `🚀 Zenvoki Recarga rodando em http://localhost:${PORT}`
    );
  }
);
