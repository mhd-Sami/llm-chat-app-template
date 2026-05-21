const chatMessages = document.getElementById("chat-messages");
const userInput = document.getElementById("user-input");
const sendButton = document.getElementById("send-button");
const typingIndicator = document.getElementById("typing-indicator");

let chatHistory = [];
let isProcessing = false;

// LOAD HISTORY ON START
async function loadHistory() {
	const res = await fetch("/api/history");
	const history = await res.json();

	chatMessages.innerHTML = "";
	chatHistory = history;

	for (let msg of history) {
		addMessageToChat(msg.role, msg.content);
	}
}

loadHistory();

userInput.addEventListener("keydown", e => {
	if (e.key === "Enter" && !e.shiftKey) {
		e.preventDefault();
		sendMessage();
	}
});

sendButton.addEventListener("click", sendMessage);

async function sendMessage() {
	const message = userInput.value.trim();
	if (!message || isProcessing) return;

	isProcessing = true;

	addMessageToChat("user", message);
	chatHistory.push({ role: "user", content: message });

	userInput.value = "";
	typingIndicator.classList.add("visible");

	const assistantEl = document.createElement("div");
	assistantEl.className = "message assistant-message";
	assistantEl.innerHTML = "<p></p>";
	const p = assistantEl.querySelector("p");
	chatMessages.appendChild(assistantEl);

	const res = await fetch("/api/chat", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ messages: chatHistory }),
	});

	const reader = res.body.getReader();
	const decoder = new TextDecoder();

	let full = "";

	while (true) {
		const { done, value } = await reader.read();
		if (done) break;

		full += decoder.decode(value);
		p.textContent = full;
	}

	chatHistory.push({ role: "assistant", content: full });

	typingIndicator.classList.remove("visible");
	isProcessing = false;
}

function addMessageToChat(role, content) {
	const div = document.createElement("div");
	div.className = `message ${role}-message`;

	const p = document.createElement("p");
	p.textContent = content;

	div.appendChild(p);
	chatMessages.appendChild(div);

	chatMessages.scrollTop = chatMessages.scrollHeight;
}
