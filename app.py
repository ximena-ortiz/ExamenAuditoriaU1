from openai import OpenAI
from flask import Flask, send_from_directory, request, jsonify
from flask_cors import CORS
import os
import json
import re

app = Flask(__name__, static_folder='dist', static_url_path='')
CORS(app, resources={r"/*": {"origins": "*"}})

# Serve SPA


@app.route('/', methods=['GET'])
def serve_index():
    return send_from_directory('dist', 'index.html')


@app.route('/<path:path>', methods=['GET'])
def serve_static(path):
    return send_from_directory('dist', path)


# ---- LLM client (Ollama compat) ----
OLLAMA_BASE_URL = os.getenv('OLLAMA_BASE_URL', 'http://localhost:11434/v1')
MODEL_CANDIDATES = os.getenv('OLLAMA_MODELS', 'llama2:7b,llama2:7b-chat,llama3.1:8b-instruct').split(',')


client = OpenAI(
    base_url=OLLAMA_BASE_URL,
    api_key='ollama',  # requerido por SDK, no usado por Ollama
)


def chat_once(messages, model, temperature=0.2, max_tokens=512):
    resp = client.chat.completions.create(
        model=model.strip(),
        messages=messages,
        temperature=temperature,
        max_tokens=max_tokens
    )
    return resp.choices[0].message.content


def ask_model(messages, temperature=0.2, max_tokens=512):
    last_err = None
    for m in MODEL_CANDIDATES:
        try:
            return chat_once(messages, m, temperature, max_tokens)
        except Exception as e:
            last_err = e
    raise RuntimeError(
        f"Error consultando modelos {MODEL_CANDIDATES}: {last_err}")

# ---- Prompts ----


def obtener_riesgos_struct(activo: str):
    """
    Devuelve dict {"items":[{"riesgo":"...", "impacto":"..."}, ...]} (5 ítems)
    """
    system = {
        "role": "system",
        "content": (
            "Eres una herramienta de gestión de riesgos ISO/IEC 27001. "
            "Dado un activo tecnológico, responde SOLO en JSON VÁLIDO con el formato: "
            "{\"items\":[{\"riesgo\":\"...\",\"impacto\":\"...\"}*5]}. "
            "El 'riesgo' es el evento; el 'impacto' describe la consecuencia. "
            "No agregues texto fuera del JSON."
        )
    }
    user = {"role": "user", "content": activo}
    raw = ask_model([system, user], temperature=0.1, max_tokens=600)

    # Tolerante: intentar parsear; si viene con texto extra, extraer bloque JSON
    try:
        return json.loads(raw)
    except Exception:
        match = re.search(r'\{[\s\S]*\}', raw)
        if match:
            return json.loads(match.group(0))
        # Fallback: intenta con bullets como tu versión anterior
        patron = r'\*\*\s*(.+?)\*\*:\s*(.+?)\.(?=\s*\n|\s*$)'
        resultados = re.findall(patron, raw)
        items = [{"riesgo": r, "impacto": i} for (r, i) in resultados[:5]]
        if items:
            return {"items": items}
        # Último recurso
        return {"items": [
            {"riesgo": "Acceso no autorizado",
                "impacto": "Divulgación de información"}
        ]}


def obtener_tratamiento_text(activo: str, riesgo: str, impacto: str):
    """
    Respuesta corta (<200 caracteres) con un tratamiento ISO 27001-alineado.
    """
    system = {
        "role": "system",
        "content": (
            "Responde en español como asesor ISO 27001. "
            "Devuelve SOLO una línea (<200 caracteres) con un tratamiento adecuado."
        )
    }
    fewshot_user = {
        "role": "user", "content": "Teléfono móvil;Acceso no autorizado;Exposición de datos personales"}
    fewshot_assistant = {"role": "assistant",
                         "content": "Habilitar bloqueo de pantalla y cifrado del dispositivo"}
    user = {"role": "user", "content": f"{activo};{riesgo};{impacto}"}
    raw = ask_model([system, fewshot_user, fewshot_assistant,
                    user], temperature=0.2, max_tokens=120)
    return raw.strip().splitlines()[0][:200]

# ---- API ----


@app.route('/analizar-riesgos', methods=['POST'])
def analizar_riesgos():
    data = request.get_json() or {}
    activo = data.get('activo', '').strip()
    if not activo:
        return jsonify({"error": "El campo 'activo' es necesario"}), 400
    obj = obtener_riesgos_struct(activo)
    return jsonify({"activo": activo, "items": obj.get("items", [])})


@app.route('/sugerir-tratamiento', methods=['POST'])
def sugerir_tratamiento():
    data = request.get_json() or {}
    activo = data.get('activo', '').strip()
    riesgo = data.get('riesgo', '').strip()
    impacto = data.get('impacto', '').strip()
    if not (activo and riesgo and impacto):
        return jsonify({"error": "Requiere 'activo', 'riesgo' e 'impacto'"}), 400
    tratamiento = obtener_tratamiento_text(activo, riesgo, impacto)
    return jsonify({"activo": activo, "riesgo": riesgo, "impacto": impacto, "tratamiento": tratamiento})


@app.route('/health', methods=['GET'])
def health():
    return jsonify({"ok": True})


if __name__ == '__main__':
    app.run(debug=True, host="0.0.0.0", port=5500)
