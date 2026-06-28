import { useState } from "react";

export default function Index() {
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState("");

  const sendMessage = async () => {
    if (!input) return;

    const userMessage = input;
    setInput("");

    setMessages((prev) => [...prev, { role: "user", text: userMessage }]);

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer YOUR_OPENAI_API_KEY`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "You are Wilson, an AI inside an app." },
          { role: "user", content: userMessage },
        ],
      }),
    });

    const data = await res.json();

    const reply =
      data?.choices?.[0]?.message?.content || "Wilson is silent.";

    setMessages((prev) => [...prev, { role: "ai", text: reply }]);
  };

  return (
    <div style={{ padding: 20, color: "white", background: "#111", height: "100vh" }}>
      <h2>Wilson Online</h2>

      <div style={{ height: 400, overflow: "auto", border: "1px solid #333", padding: 10 }}>
        {messages.map((m, i) => (
          <div key={i} style={{ marginBottom: 8 }}>
            <b>{m.role}:</b> {m.text}
          </div>
        ))}
      </div>

      <div style={{ marginTop: 10 }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Talk to Wilson..."
          style={{ padding: 8, width: "70%" }}
        />

        <button onClick={sendMessage} style={{ padding: 8 }}>
          Send
        </button>
      </div>
    </div>
  );
}
