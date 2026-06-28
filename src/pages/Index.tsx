import { useState } from "react";

export default function Index() {
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  const sendMessage = async () => {
    if (!input || loading) return;

    const userMessage = input;
    setInput("");

    // Add user message instantly
    setMessages((prev) => [
      ...prev,
      { role: "user", text: userMessage },
    ]);

    setLoading(true);

    try {
      const res = await fetch("https://chatgpt-api.shn.hk/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-3.5-turbo",
          messages: [
            {
              role: "system",
              content: "You are Wilson, an AI inside a web app.",
            },
            {
              role: "user",
              content: userMessage,
            },
          ],
        }),
      });

      const data = await res.json();

      const reply =
        data?.choices?.[0]?.message?.content || "Wilson is silent.";

      setMessages((prev) => [
        ...prev,
        { role: "ai", text: reply },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: "ai", text: "Error: Wilson connection failed." },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        padding: 20,
        color: "white",
        background: "#111",
        height: "100vh",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <h2>Wilson Online</h2>

      {/* Messages */}
      <div
        style={{
          flex: 1,
          overflow: "auto",
          border: "1px solid #333",
          padding: 10,
          marginBottom: 10,
        }}
      >
        {messages.map((m, i) => (
          <div key={i} style={{ marginBottom: 8 }}>
            <b>{m.role}:</b> {m.text}
          </div>
        ))}

        {loading && (
          <div style={{ opacity: 0.7 }}>Wilson is thinking...</div>
        )}
      </div>

      {/* Input */}
      <div style={{ display: "flex", gap: 8 }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Talk to Wilson..."
          style={{ padding: 10, flex: 1 }}
          onKeyDown={(e) => e.key === "Enter" && sendMessage()}
        />

        <button onClick={sendMessage} style={{ padding: 10 }}>
          Send
        </button>
      </div>
    </div>
  );
}
