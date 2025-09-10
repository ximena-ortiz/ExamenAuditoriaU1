import React, { useContext, useEffect, useRef, useState } from "react";
import {
  Button,
  Form,
  Input,
  Popconfirm,
  Table,
  Modal,
  Layout,
  Typography,
  message,
} from "antd";
import { LogoutOutlined, UserOutlined } from "@ant-design/icons";
import axios from "axios";

// Ajusta estas rutas según tu estructura actual
import Login from "./components/Login.jsx";
import { isAuthenticated, logout } from "./services/LoginService";

axios.defaults.baseURL =
  import.meta?.env?.VITE_API_URL || "http://localhost:5500";

// ---- Editable table helpers (Ant Design pattern) ----
const EditableContext = React.createContext(null);

const EditableRow = ({ index, ...props }) => {
  const [form] = Form.useForm();
  return (
    <Form form={form} component={false}>
      <EditableContext.Provider value={form}>
        <tr {...props} />
      </EditableContext.Provider>
    </Form>
  );
};

const EditableCell = ({
  title,
  editable,
  children,
  dataIndex,
  record,
  handleSave,
  ...restProps
}) => {
  const [editing, setEditing] = useState(false);
  const inputRef = useRef(null);
  const form = useContext(EditableContext);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
    }
  }, [editing]);

  const toggleEdit = () => {
    setEditing(!editing);
    form.setFieldsValue({ [dataIndex]: record[dataIndex] });
  };

  const save = async () => {
    try {
      const values = await form.validateFields();
      toggleEdit();
      handleSave({ ...record, ...values });
    } catch (err) {
      console.error("Save failed:", err);
    }
  };

  let childNode = children;

  if (editable) {
    childNode = editing ? (
      <Form.Item
        style={{ margin: 0 }}
        name={dataIndex}
        rules={[
          {
            required: true,
            message: `${title} es requerido`,
          },
        ]}
      >
        <Input ref={inputRef} onPressEnter={save} onBlur={save} />
      </Form.Item>
    ) : (
      <div
        className="editable-cell-value-wrap"
        style={{ paddingRight: 24, minHeight: 22, cursor: "pointer" }}
        onClick={toggleEdit}
        title="Haz clic para editar"
      >
        {children}
      </div>
    );
  }

  return <td {...restProps}>{childNode}</td>;
};

// ---- App principal ----
const { Header, Content, Footer } = Layout;
const { Title, Text } = Typography;

const App = () => {
  const [authenticated, setAuthenticated] = useState(isAuthenticated());
  const [currentUser, setCurrentUser] = useState(
    localStorage.getItem("user") || ""
  );

  const [isLoading, setIsLoading] = useState(false);
  const [isRecommending, setIsRecommending] = useState(false);
  const [suggestEnabled, setSuggestEnabled] = useState(false);

  const [isModalVisible, setIsModalVisible] = useState(false);
  const [newData, setNewData] = useState({ activo: "" });

  const [dataSource, setDataSource] = useState([]);
  const [count, setCount] = useState(1);

  // ---- Login handlers ----
  const handleLoginSuccess = (response) => {
    setAuthenticated(true);
    setCurrentUser(response.user);
    message.success(`Bienvenido, ${response.user}!`);
  };

  const handleLogout = () => {
    logout();
    setAuthenticated(false);
    setCurrentUser("");
    message.info("Sesión cerrada correctamente");
  };

  // ---- Modal add asset ----
  const showModal = () => setIsModalVisible(true);
  const handleCancel = () => setIsModalVisible(false);

  const handleDelete = (key) => {
    setDataSource((prev) => prev.filter((item) => item.key !== key));
  };

  // Llamar al backend para generar 5 riesgos/impactos
  const handleOk = async () => {
    const activo = newData.activo.trim();
    if (!activo) {
      message.error("Por favor ingresa un nombre de activo");
      return;
    }
    setIsLoading(true);
    try {
      const { data } = await axios.post("/analizar-riesgos", { activo });
      const items = (data.items || []).slice(0, 5);
      if (!items.length) throw new Error("El motor IA no devolvió ítems");

      const rows = items.map((it, idx) => ({
        key: `${count + idx}`,
        activo,
        riesgo: it.riesgo,
        impacto: it.impacto,
        tratamiento: "-",
      }));

      setDataSource((prev) => [...prev, ...rows]);
      setCount((prev) => prev + rows.length);
      setSuggestEnabled(true);
      setIsModalVisible(false);
      message.success(`Activo "${activo}" evaluado (${rows.length} riesgos)`);
    } catch (e) {
      console.error(e);
      message.error(
        "No se pudo analizar riesgos. Revisa que el backend y Ollama estén activos."
      );
    } finally {
      setIsLoading(false);
      setNewData({ activo: "" });
    }
  };

  // Solicitar tratamientos para cada fila
  const handleRecommendTreatment = async () => {
    if (!dataSource.length) {
      message.warning("No hay riesgos para recomendar tratamientos");
      return;
    }
    setIsRecommending(true);
    try {
      const updated = [];
      for (const row of dataSource) {
        if (row.tratamiento && row.tratamiento !== "-") {
          updated.push(row);
          continue;
        }
        try {
          const { data } = await axios.post("/sugerir-tratamiento", {
            activo: row.activo,
            riesgo: row.riesgo,
            impacto: row.impacto,
          });
          updated.push({
            ...row,
            tratamiento: (data && data.tratamiento) || "-",
          });
        } catch (err) {
          console.error("Error recomendando tratamiento:", err);
          updated.push({ ...row, tratamiento: row.tratamiento || "-" });
        }
      }
      setDataSource(updated);
      message.success("Tratamientos recomendados");
    } catch (e) {
      console.error(e);
      message.error("No se pudieron sugerir tratamientos");
    } finally {
      setIsRecommending(false);
    }
  };

  // ---- Editable table wiring ----
  const handleSave = (row) => {
    const newData = [...dataSource];
    const index = newData.findIndex((item) => row.key === item.key);
    const item = newData[index];
    newData.splice(index, 1, { ...item, ...row });
    setDataSource(newData);
  };

  const components = {
    body: {
      row: EditableRow,
      cell: EditableCell,
    },
  };

  const defaultColumns = [
    {
      title: "Activo",
      dataIndex: "activo",
      width: "18%",
      editable: true,
    },
    {
      title: "Riesgo",
      dataIndex: "riesgo",
      width: "22%",
      editable: true,
    },
    {
      title: "Impacto",
      dataIndex: "impacto",
      width: "35%",
      editable: true,
    },
    {
      title: "Tratamiento",
      dataIndex: "tratamiento",
      width: "20%",
      editable: true,
    },
    {
      title: "Operación",
      dataIndex: "operation",
      width: "5%",
      render: (_, record) =>
        dataSource.length >= 1 ? (
          <Popconfirm
            title="¿Seguro que quieres eliminar?"
            onConfirm={() => handleDelete(record.key)}
          >
            <a>Eliminar</a>
          </Popconfirm>
        ) : null,
    },
  ];

  const columns = defaultColumns.map((col) => {
    if (!col.editable) return col;
    return {
      ...col,
      onCell: (record) => ({
        record,
        editable: col.editable,
        dataIndex: col.dataIndex,
        title: col.title,
        handleSave,
      }),
    };
  });

  // ---- Render ----
  if (!authenticated) {
    return <Login onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <Layout style={{ minHeight: "100vh" }}>
      <Header
        style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}
      >
        <Title level={4} style={{ color: "white", margin: 0 }}>
          Sistema de Auditoría de Riesgos
        </Title>
        <div style={{ display: "flex", alignItems: "center" }}>
          <Text style={{ color: "white", marginRight: 16 }}>
            <UserOutlined /> {currentUser}
          </Text>
          <Button
            type="link"
            icon={<LogoutOutlined />}
            onClick={handleLogout}
            style={{ color: "white" }}
          >
            Cerrar Sesión
          </Button>
        </div>
      </Header>

      <Content style={{ padding: 24, background: "#fff" }}>
        <div>
          <Button onClick={showModal} type="primary" style={{ marginBottom: 16 }}>
            + Agregar activo
          </Button>
          <Button
            onClick={handleRecommendTreatment}
            type="primary"
            loading={isRecommending}
            disabled={!suggestEnabled}
            style={{ marginBottom: 16, marginLeft: 8 }}
          >
            Recomendar tratamientos
          </Button>

          <Modal
            title="Agregar nuevo activo"
            open={isModalVisible}
            onOk={handleOk}
            onCancel={handleCancel}
            okText="Evaluar"
            cancelText="Cancelar"
            confirmLoading={isLoading}
          >
            <Form layout="vertical">
              <Form.Item label="Activo" required>
                <Input
                  name="activo"
                  value={newData.activo}
                  onChange={(e) => setNewData({ activo: e.target.value })}
                  placeholder="Ej: Base de datos de clientes"
                />
              </Form.Item>
            </Form>
          </Modal>

          <Table
            components={components}
            rowClassName={() => "editable-row"}
            bordered
            dataSource={dataSource}
            columns={columns}
            pagination={{ pageSize: 8 }}
          />
        </div>
      </Content>

      <Footer style={{ textAlign: "center" }}>
        Sistema de Auditoría de Riesgos ©{new Date().getFullYear()}
      </Footer>
    </Layout>
  );
};

export default App;
