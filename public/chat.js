const chatMessages = document.getElementById("chat-messages");
const userInput = document.getElementById("user-input");
const sendButton = document.getElementById("send-button");
const typingIndicator = document.getElementById("typing-indicator");

let chatHistory = [];
let isProcessing = false;

/**
 * Load chat history from backend
 */
async function loadHistory() {
	try {
		const res = await fetch("/api/history");

		if (!res.ok) {
			console.warn("No history endpoint or failed to load history");
			return;
		}

		const history = await res.json();

		chatMessages.innerHTML = "";
		chatHistory = history;

		for (let msg of history) {
			addMessageToChat(msg.role, msg.content);
		}
	} catch (err) {
		console.error("History load error:", err);
	}
}

loadHistory();

/**
 * Enter key send
 */
userInput.addEventListener("keydown", (e) => {
	if (e.key === "Enter" && !e.shiftKey) {
		e.preventDefault();
		sendMessage();
	}
});

sendButton.addEventListener("click", sendMessage);

/**
 * Send message to backend
 */
async function sendMessage() {
	const message = userInput.value.trim();
	if (!message || isProcessing) return;

	isProcessing = true;

	// show user message
	addMessageToChat("user", message);
	chatHistory.push({ role: "user", content: message });

	userInput.value = "";
	typingIndicator.classList.add("visible");

	// assistant placeholder
	const assistantEl = document.createElement("div");
	assistantEl.className = "message assistant-message";
	const p = document.createElement("p");
	assistantEl.appendChild(p);
	chatMessages.appendChild(assistantEl);

	try {
		const res = await fetch("/api/chat", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ messages: chatHistory }),
		});

		if (!res.body) throw new Error("No stream received");

		const reader = res.body.getReader();
		const decoder = new TextDecoder();

		let buffer = "";
		let fullResponse = "";

		while (true) {
			const { done, value } = await reader.read();
			if (done) break;

			buffer += decoder.decode(value, { stream: true });

			// Split SSE blocks
			const parts = buffer.split("\n\n");
			buffer = parts.pop();

			for (let part of parts) {
				const lines = part.split("\n");

				for (let line of lines) {
					if (!line.startsWith("data:")) continue;

					let jsonStr = line.replace("data:", "").trim();

					if (jsonStr === "[DONE]") continue;

					try {
						const json = JSON.parse(jsonStr);

						// Cloudflare AI response format
						if (json.response) {
							fullResponse += json.response;
							p.textContent = fullResponse;
							chatMessages.scrollTop = chatMessages.scrollHeight;
						}
					} catch (err) {
						console.error("Parse error:", jsonStr);
					}
				}
			}
		}

		// save assistant message
		chatHistory.push({ role: "assistant", content: fullResponse });
	} catch (err) {
		console.error(err);
		p.textContent = "Error: Failed to get response";
	} finally {
		typingIndicator.classList.remove("visible");
		isProcessing = false;
	}
}

/**
 * Add message to UI
 */
function addMessageToChat(role, content) {
	const div = document.createElement("div");
	div.className = `message ${role}-message`;

	const p = document.createElement("p");
	p.textContent = content;

	div.appendChild(p);
	chatMessages.appendChild(div);

	chatMessages.scrollTop = chatMessages.scrollHeight;
}
