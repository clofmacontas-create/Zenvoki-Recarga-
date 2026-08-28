require("dotenv").config();

const express = require("express");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");

const app = express();
const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, "db.json");

const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false }
    })
  : null;


// =========================
// BANCO DE DADOS
// =========================

function carregarDB() {
  if (!fs.existsSync(DB_FILE)) {
    const dbInicial = {
  users: [],
  orders: [],
  rechargeMode: "sem_codigo",
  rechargeModes: {
    TIM: "sem_codigo",
    CLARO: "sem_codigo",
    VIVO: "sem_codigo"
  },
  recharges: {}
};
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
  rechargeModes: {
    TIM: "sem_codigo",
    CLARO: "sem_codigo",
    VIVO: "sem_codigo"
  },
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
  !db.rechargeModes ||
  typeof db.rechargeModes !== "object"
) {
  db.rechargeModes = {
    TIM: "sem_codigo",
    CLARO: "sem_codigo"
  };

  salvarDB(db);
}

for (const operadora of ["TIM", "CLARO", "VIVO"]) {
  if (
    !["sem_codigo", "com_codigo"].includes(
      db.rechargeModes[operadora]
    )
  ) {
    db.rechargeModes[operadora] =
      "sem_codigo";
  }
}

  if (
    !db.recharges ||
    typeof db.recharges !== "object"
  ) {
    db.recharges = {};
  }

if (
  !db.operadoras ||
  typeof db.operadoras !== "object"
) {
  db.operadoras = {
    TIM: true,
    CLARO: true,
    VIVO: true
  };

  salvarDB(db);
}
  return db;
}

function salvarDB(db) {
  fs.writeFileSync(
    DB_FILE,
    JSON.stringify(db, null, 2)
  );
}

async function garantirUsuarioInicial() {

  const db =
    carregarDB();

  if (db.users.length > 0) {
    return;
  }

  const username =
    process.env.INITIAL_USER;

  const email =
    process.env.INITIAL_EMAIL;

  const senha =
    process.env.ZENVOKI_INITIAL_PASSWORD;

  if (
    !username ||
    !email ||
    !senha
  ) {
    console.log(
      "ℹ️ Usuário inicial não configurado."
    );

    return;
  }

  const senhaHash =
    await bcrypt.hash(
      senha,
      12
    );

  db.users.push({

    id:
      Date.now().toString(),

    nome:
      "Zenvoki",

    username:
      username,

    email:
      email.toLowerCase(),

    senha:
      senhaHash,

    criadoEm:
      new Date().toISOString()

  });

  salvarDB(db);

  console.log(
    "✅ Usuário inicial criado."
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

    VIVO: {
      "50": {
        preco: 28,
        ativo: true
      },
      "100": {
        preco: 40,
        ativo: true
      },
      "200": {
        preco: 63,
        ativo: true
      },
      "300": {
        preco: 93,
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
          process.env.ZENVOKI_ADMIN_USER ||
        senha !==
          process.env.ZENVOKI_ADMIN_PASSWORD
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

app.get(
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
// HISTÓRICO DO CLIENTE
// =========================

app.get(
  "/api/my-orders",
  (req, res) => {
    try {

      if (!req.session.userId) {
        return res.status(401).json({
          authenticated: false
        });
      }

      const db = carregarDB();

      const pedidos = db.orders
        .filter(
          order =>
            order.usuarioId === req.session.userId
        )
        .sort(
          (a, b) =>
            new Date(b.criadoEm) -
            new Date(a.criadoEm)
        );

      res.json({
        authenticated: true,
        orders: pedidos
      });

    } catch (erro) {

      console.error(
        "Erro ao carregar histórico:",
        erro
      );

      res.status(500).json({
        error: "Não foi possível carregar o histórico."
      });

    }
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
// CLIENTE - STATUS OPERADORAS
// =========================

app.get(
  "/api/operadoras",
  (req, res) => {
    try {
      const db = carregarDB();

      res.json({
        success: true,
        operadoras: db.operadoras || {
          TIM: true,
          CLARO: true,
          VIVO: true
        }
      });

    } catch (error) {
      console.error(
        "Erro ao carregar status das operadoras:",
        error
      );

      res.status(500).json({
        error:
          "Não foi possível carregar o status das operadoras."
      });
    }
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
// CLIENTE - MODO DA RECARGA POR OPERADORA
// =========================
app.get("/api/recharge-mode/:operadora", (req, res) => {
  try {
    const db = carregarDB();
    const operadora = String(req.params.operadora || "").toUpperCase();

    if (!["TIM", "CLARO", "VIVO"].includes(operadora)) {
      return res.status(400).json({
        success: false,
        error: "Operadora inválida."
      });
    }

    const modo =
      db.rechargeModes?.[operadora] ||
      db.rechargeMode ||
      "sem_codigo";

    res.json({
      success: true,
      operadora,
      modoRecarga: modo
    });

  } catch (error) {
    console.error("Erro ao consultar modo da recarga:", error);

    res.status(500).json({
      success: false,
      error: "Não foi possível consultar o modo da recarga."
    });
  }
});

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
// =========================
// ADMIN - MODO DE RECARGA POR OPERADORA
// =========================

app.get(
  "/api/admin/recharge-mode",
  exigirAdmin,
  (req, res) => {
    try {
      const db = carregarDB();

      if (
        !db.rechargeModes ||
        typeof db.rechargeModes !== "object"
      ) {
        db.rechargeModes = {
          TIM: "sem_codigo",
          CLARO: "sem_codigo"
        };

        salvarDB(db);
      }

      for (const operadora of ["TIM", "CLARO", "VIVO"]) {
        if (
          !["sem_codigo", "com_codigo"].includes(
            db.rechargeModes[operadora]
          )
        ) {
          db.rechargeModes[operadora] = "sem_codigo";
        }
      }

      salvarDB(db);

      res.json({
        success: true,
        modosRecarga: db.rechargeModes
      });

    } catch (error) {
      console.error(
        "Erro ao carregar modos de recarga:",
        error
      );

      res.status(500).json({
        error:
          "Não foi possível carregar os modos de recarga."
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
        operadora,
        modoRecarga
      } = req.body;

      const operadorasPermitidas = [
        "TIM",
        "CLARO",
        "VIVO"
      ];

      const modosPermitidos = [
        "sem_codigo",
        "com_codigo"
      ];

      if (
        !operadorasPermitidas.includes(
          operadora
        )
      ) {
        return res.status(400).json({
          error:
            "Operadora inválida."
        });
      }

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

      const db = carregarDB();

      if (
        !db.rechargeModes ||
        typeof db.rechargeModes !== "object"
      ) {
        db.rechargeModes = {
          TIM: "sem_codigo",
          CLARO: "sem_codigo"
        };
      }

      db.rechargeModes[operadora] =
        modoRecarga;

      salvarDB(db);

      res.json({
        success: true,

        operadora,

        modoRecarga,

        message:
          operadora +
          " configurada como " +
          (
            modoRecarga === "com_codigo"
              ? "recarga com código."
              : "recarga sem código."
          )
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
// ADMIN - STATUS DAS OPERADORAS
// =========================

app.get(
  "/api/admin/operadoras",
  exigirAdmin,
  (req, res) => {
    try {
      const db = carregarDB();

      res.json({
        success: true,
        operadoras: db.operadoras || {
          TIM: true,
          CLARO: true,
          VIVO: true
        }
      });

    } catch (error) {
      console.error(
        "Erro ao carregar status das operadoras:",
        error
      );

      res.status(500).json({
        error:
          "Não foi possível carregar o status das operadoras."
      });
    }
  }
);

app.post(
  "/api/admin/operadoras",
  exigirAdmin,
  (req, res) => {
    try {
      const {
        operadora,
        ativo
      } = req.body;

      if (
        !["TIM", "CLARO", "VIVO"].includes(operadora) ||
        typeof ativo !== "boolean"
      ) {
        return res.status(400).json({
          error:
            "Dados da operadora inválidos."
        });
      }

      const db = carregarDB();

      if (
        !db.operadoras ||
        typeof db.operadoras !== "object"
      ) {
        db.operadoras = {
          TIM: true,
          CLARO: true,
          VIVO: true
        };
      }

      db.operadoras[operadora] = ativo;

      salvarDB(db);

      res.json({
        success: true,
        operadoras: db.operadoras
      });

    } catch (error) {
      console.error(
        "Erro ao alterar status da operadora:",
        error
      );

      res.status(500).json({
        error:
          "Não foi possível alterar o status da operadora."
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
app.post(
  "/api/pix",
  async (req, res) => {

    try {

      const {
        operadora,
        recarga,
        preco,
        numero
      } = req.body;

      if (
        !operadora ||
        !recarga ||
        !preco ||
        !numero
      ) {

        return res.status(400).json({

          error:
            "Dados do pedido incompletos."

        });

      }

      const token =
        process.env.PIX_DIRECT_TOKEN;

      if (!token) {

        return res.status(500).json({

          error:
            "PIX_DIRECT_TOKEN não configurada no .env."

        });

      }

      const valor =
        Number(preco);

      if (
        !Number.isFinite(valor) ||
        valor <= 0
      ) {

        return res.status(400).json({

          error:
            "Valor inválido."

        });

      }

      // =========================
      // TAXA DO GATEWAY
      // 10% + R$ 1,99
      // =========================

      const taxaFixa = 1.99;
      const taxaPercentual = 0.10;

      const valorComTaxa =
        (valor + taxaFixa) /
        (1 - taxaPercentual);

      const amount_cents =
        Math.round(
          valorComTaxa * 100
        );

      // =========================
      // COBRANÇA PIX
      // =========================

      const response =
        await fetch(
          "https://pix.direct/v1/deposits",
          {

            method:
              "POST",

            headers: {

              "Authorization":
                `Bearer ${token}`,

              "Content-Type":
                "application/json"

            },

            body:
              JSON.stringify({
                amount_cents
              })

          }
        );

      const data =
        await response.json();

      if (!response.ok) {

        console.error(
          "Erro Pix.direct:",
          data
        );

        return res.status(
          response.status
        ).json({

          error:
            "Não foi possível criar a cobrança Pix.",

          details:
            data

        });

      }

      // =========================
      // SALVAR PEDIDO
      // =========================

      const db =
        carregarDB();

      let usuario =
        null;

      if (
        req.session.userId
      ) {

        usuario =
          db.users.find(
            user =>
              user.id ===
              req.session.userId
          );

      }

      const novoPedido = {

        id:
          Date.now().toString(),

        usuarioId:
          usuario
            ? usuario.id
            : null,

        nomeCliente:
          usuario
            ? usuario.nome
            : null,

        usernameCliente:
          usuario
            ? usuario.username
            : null,

        emailCliente:
          usuario
            ? usuario.email
            : null,

        numero,

        operadora,

        recarga,

        preco:
          valor,

        amount_cents,

        pixId:
          data.id,

        pixStatus:
          data.status ||
          "pending",

        status:
          "pending",

        criadoEm:
          new Date().toISOString(),

        atualizadoEm:
          new Date().toISOString()

      };

      db.orders.push(
        novoPedido
      );

      // Hostless: salva o pedido no PostgreSQL
      // porque /app/db.json é somente leitura.
      if (pool) {
        await pool.query(`
          CREATE TABLE IF NOT EXISTS orders (
            id TEXT PRIMARY KEY,
            usuario_id TEXT,
            nome_cliente TEXT,
            username_cliente TEXT,
            email_cliente TEXT,
            numero TEXT NOT NULL,
            operadora TEXT NOT NULL,
            recarga TEXT NOT NULL,
            preco NUMERIC NOT NULL,
            amount_cents INTEGER NOT NULL,
            pix_id TEXT,
            pix_status TEXT,
            status TEXT,
            criado_em TIMESTAMP,
            atualizado_em TIMESTAMP
          )
        `);

        await pool.query(
          `INSERT INTO orders (
            id,
            usuario_id,
            nome_cliente,
            username_cliente,
            email_cliente,
            numero,
            operadora,
            recarga,
            preco,
            amount_cents,
            pix_id,
            pix_status,
            status,
            criado_em,
            atualizado_em
          ) VALUES (
            $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15
          )
          ON CONFLICT (id) DO NOTHING`,
          [
            novoPedido.id,
            novoPedido.usuarioId,
            novoPedido.nomeCliente,
            novoPedido.usernameCliente,
            novoPedido.emailCliente,
            novoPedido.numero,
            novoPedido.operadora,
            novoPedido.recarga,
            novoPedido.preco,
            novoPedido.amount_cents,
            novoPedido.pixId,
            novoPedido.pixStatus,
            novoPedido.status,
            novoPedido.criadoEm,
            novoPedido.atualizadoEm
          ]
        );
      } else {
        salvarDB(db);
      }

      // =========================
      // RETORNO
      // =========================

      return res.json({

        success:
          true,

        pedido: {

          id:
            novoPedido.id,

          operadora,

          recarga,

          preco,

          numero

        },

        pix: {

          id:
            data.id,

          status:
            data.status,

          amount_cents:
            data.amount_cents,

          fee_cents:
            data.fee_cents,

          net_cents:
            data.net_cents,

          pix_code:
            data.pix_code,

          qr_code_base64:
            data.qr_code_base64

        },

        pixCopiaCola:
          data.pix_code,

        qrCode:
          data.qr_code_base64

      });

    } catch (error) {

      console.error(
        "Erro ao criar Pix:",
        error
      );

      return res.status(500).json({

        error:
          "Erro interno ao criar a cobrança Pix."

      });

    }

  }
);

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

(async () => {
  try {
    console.log("ENV CHECK:", {
      ADMIN_USER: process.env.ZENVOKI_ADMIN_USER || false,
      ADMIN_PASSWORD: !!process.env.ZENVOKI_ADMIN_PASSWORD,
      DATABASE_URL: !!process.env.DATABASE_URL,
      INITIAL_USER: !!process.env.INITIAL_USER,
      INITIAL_EMAIL: !!process.env.INITIAL_EMAIL,
      INITIAL_PASSWORD: !!process.env.ZENVOKI_INITIAL_PASSWORD
    });

    await garantirUsuarioInicial();

    app.listen(
      PORT,
      "0.0.0.0",
      () => {
        console.log(
          `🚀 Zenvoki Recarga rodando em http://localhost:${PORT}`
        );
      }
    );

  } catch (error) {
    console.error(
      "❌ Erro ao iniciar o servidor:",
      error
    );

    process.exit(1);
  }
})();
