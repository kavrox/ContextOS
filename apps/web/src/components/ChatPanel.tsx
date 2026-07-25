import { useState, useEffect, useRef } from 'react';
import { Sparkles, Send, Brain, Zap, Clock, GitPullRequest } from 'lucide-react';
import { searchKnowledgeBase } from '../utils/dataStore';
import type { DemoScenario } from '../utils/dataStore';
import { mcpAskLiveGithubRepo } from '../utils/mcpClient';
import CitationCard from './CitationCard';

interface ChatPanelProps {
  onScenarioChange: (scenario: DemoScenario) => void;
  activeScenario: DemoScenario;
}

export default function ChatPanel({ onScenarioChange, activeScenario }: ChatPanelProps) {
  const [query, setQuery] = useState('');
  const [githubRepo, setGithubRepo] = useState('');
  const [useCache, setUseCache] = useState(true);
  const [askedQuestions, setAskedQuestions] = useState<Record<string, boolean>>({});
  
  // Simulation states
  const [pipelineState, setPipelineState] = useState<'idle' | 'planning' | 'retrieving' | 'reasoning' | 'streaming' | 'done'>('done');
  const [statusMessage, setStatusMessage] = useState('');
  const [streamedText, setStreamedText] = useState(activeScenario.answer);
  const streamTimerRef = useRef<number | null>(null);

  // Auto-synchronize streamed text when activeScenario changes from parent
  useEffect(() => {
    setStreamedText(activeScenario.answer);
    setPipelineState('done');
  }, [activeScenario]);

  const presetQuestions = [
    { text: "Why are we using Redis?", id: "redis" },
    { text: "What happens if I modify CheckoutService?", id: "checkout" },
    { text: "Show me how authentication evolved.", id: "auth" },
    { text: "How does modifying the EvidenceItem schema affect Alice's foundation code?", id: "alice" },
    { text: "What is the company's workflow and core thought process?", id: "workflow" }
  ];

  const handleAsk = async (textToAsk: string) => {
    if (!textToAsk.trim()) return;
    
    // Stop any active stream timers
    if (streamTimerRef.current) {
      clearInterval(streamTimerRef.current);
    }

    const normText = textToAsk.trim();

    // LIVE LLM MODE
    if (githubRepo.trim() !== '') {
      setPipelineState('planning');
      setStatusMessage(`Cloning and bundling ${githubRepo}...`);
      setStreamedText('');
      
      const liveScenario: DemoScenario = {
        question: normText,
        answer: '',
        citations: [],
        graph: { nodes: [], edges: [] },
        task: {
          id: 'live-llm-task',
          question: normText,
          status: 'planning',
          plan: [],
          executionTrace: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      };
      onScenarioChange(liveScenario);

      try {
        setStatusMessage('Groq Llama 3.3 70B is analyzing the codebase...');
        const result = await mcpAskLiveGithubRepo(normText, githubRepo.trim());
        
        liveScenario.answer = result.answer;
        liveScenario.task.status = 'completed';
        onScenarioChange({ ...liveScenario });
        
        setPipelineState('done');
        setStreamedText(result.answer);
      } catch (err: any) {
        setPipelineState('done');
        setStreamedText(`❌ LLM Live Query Failed: ${err.message}\n(Ensure the Live API server is running: npx tsx src/live-api.ts)`);
      }
      return;
    }

    // MOCK MODE
    const resolved = searchKnowledgeBase(normText);
    
    // Check if it's a fast-path cache hit
    const isCacheHit = useCache && askedQuestions[resolved.question];

    // Mark as asked
    setAskedQuestions(prev => ({ ...prev, [resolved.question]: true }));

    if (isCacheHit) {
      // Instant display
      setPipelineState('done');
      setStreamedText(resolved.answer);
      onScenarioChange(resolved);
    } else {
      // Run pipeline simulation sequence
      setPipelineState('planning');
      setStatusMessage('Planner resolving entity scope...');
      setStreamedText('');
      
      // Update trace panel parent to show planning state
      onScenarioChange({
        ...resolved,
        task: { ...resolved.task, status: 'planning' }
      });

      // Simulation timeouts
      setTimeout(() => {
        setPipelineState('retrieving');
        setStatusMessage('Retriever calling Slack/GitHub MCP tools...');
        onScenarioChange({
          ...resolved,
          task: { ...resolved.task, status: 'retrieving' }
        });

        setTimeout(() => {
          setPipelineState('reasoning');
          setStatusMessage('Claude analyzing retrieved excerpts...');
          onScenarioChange({
            ...resolved,
            task: { ...resolved.task, status: 'reasoning' }
          });

          setTimeout(() => {
            setPipelineState('streaming');
            setStatusMessage('');
            onScenarioChange({
              ...resolved,
              task: { ...resolved.task, status: 'completed' }
            });

            // Stream answer words
            const words = resolved.answer.split(' ');
            let index = 0;
            let currentText = '';

            streamTimerRef.current = window.setInterval(() => {
              if (index < words.length) {
                currentText += (index === 0 ? '' : ' ') + words[index];
                setStreamedText(currentText);
                index++;
              } else {
                if (streamTimerRef.current) clearInterval(streamTimerRef.current);
                setPipelineState('done');
              }
            }, 30); // word interval

          }, 800);
        }, 800);
      }, 800);
    }
  };

  const handleCitationClick = (url: string) => {
    window.open(url, '_blank');
  };

  // Convert markdown citation syntax like [gh-pr-48] or [slack-msg-101] to clickable colored tags
  const renderFormattedAnswer = (text: string) => {
    if (!text) return null;
    
    // Pattern to catch citation tokens [sourceId](url) or [sourceId]
    const parts = text.split(/(\[[a-zA-Z0-9-_\s.]+\]\([^)]+\)|\[[a-zA-Z0-9-_\s.]+\])/g);
    
    return parts.map((part, index) => {
      // Check if markdown link style: [name](url)
      const linkMatch = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      // Check if simple bracket tag style: [sourceId]
      const tagMatch = part.match(/^\[([^\]]+)\]$/);

      if (linkMatch) {
        const [, label, url] = linkMatch;
        return (
          <button
            key={index}
            onClick={() => handleCitationClick(url)}
            className="inline-flex items-center gap-0.5 px-1.5 py-0.2 mx-0.5 rounded text-[10px] font-mono font-bold bg-accent-indigo/15 text-accent-indigo border border-accent-indigo/35 hover:bg-accent-indigo hover:text-white transition-colors"
          >
            {label}
          </button>
        );
      } else if (tagMatch) {
        const [, label] = tagMatch;
        // See if we have a matching citation in citations array to grab its url
        const matchingCitation = activeScenario.citations.find(
          c => c.sourceId.toLowerCase() === label.toLowerCase()
        );
        const url = matchingCitation?.url || '#';
        return (
          <button
            key={index}
            onClick={() => handleCitationClick(url)}
            className="inline-flex items-center gap-0.5 px-1.5 py-0.2 mx-0.5 rounded text-[10px] font-mono font-bold bg-accent-indigo/15 text-accent-indigo border border-accent-indigo/35 hover:bg-accent-indigo hover:text-white transition-colors"
          >
            {label}
          </button>
        );
      }
      
      return <span key={index}>{part}</span>;
    });
  };

  const isCacheHitActive = useCache && askedQuestions[activeScenario.question];

  return (
    <div className="flex flex-col lg:flex-row gap-6 w-full h-[650px] min-h-0">
      
      {/* Left Column: Chat Area */}
      <div className="flex-1 bg-surface border border-border rounded-2xl flex flex-col min-h-0">
        
        {/* Chat Header controls */}
        <div className="p-4 border-b border-border/80 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-accent-indigo/10 flex items-center justify-center">
              <Brain className="w-3.5 h-3.5 text-accent-indigo" />
            </div>
            <h3 className="text-sm font-semibold text-white">Engineering Memory Chat</h3>
          </div>

          {/* Cache toggle */}
          <div className="flex items-center gap-3">
            <span className="text-[10px] text-gray-500 font-mono">Memory Cache:</span>
            <button
              onClick={() => setUseCache(!useCache)}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg border transition-all duration-200 ${
                useCache 
                  ? 'bg-accent-emerald/10 border-accent-emerald/30 text-accent-emerald' 
                  : 'bg-background border-border text-gray-500'
              }`}
            >
              <Zap className={`w-3 h-3 ${useCache ? 'fill-accent-emerald' : ''}`} />
              <span className="text-[10px] font-mono font-bold">
                {useCache ? 'ENABLED' : 'DISABLED'}
              </span>
            </button>
          </div>
        </div>

        {/* Preset Questions Bar */}
        <div className="px-4 py-3 bg-background/30 border-b border-border/50 flex flex-wrap gap-2 items-center">
          <span className="text-[10px] text-gray-500 font-mono font-semibold uppercase">Demo Presets:</span>
          {presetQuestions.map((q) => (
            <button
              key={q.id}
              onClick={() => {
                setQuery(q.text);
                handleAsk(q.text);
              }}
              className="text-[11px] px-2.5 py-1 rounded-full border border-border/80 bg-background/60 hover:bg-surface-hover/80 hover:border-accent-indigo/50 text-gray-300 hover:text-white transition-all duration-150 text-left"
            >
              {q.text}
            </button>
          ))}
        </div>

        {/* Messages view workspace */}
        <div className="flex-1 p-5 overflow-y-auto space-y-4">
          {/* Default Welcome Message */}
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-xl bg-accent-indigo/10 border border-accent-indigo/20 flex items-center justify-center shrink-0">
              <Brain className="w-4 h-4 text-accent-indigo" />
            </div>
            <div className="bg-surface-hover/50 border border-border/60 p-4 rounded-2xl max-w-[80%] space-y-2">
              <p className="text-xs text-gray-300 leading-relaxed">
                Welcome to ContextOS. Ask me a codebase question, and I will resolve static service relationships, pull related GitHub files and Slack history threads, and output grounded claims.
              </p>
              <p className="text-xs text-gray-400">
                Type a question or select one of the Demo Presets above.
              </p>
            </div>
          </div>

          {/* User Asked Question */}
          {activeScenario.question && (
            <div className="flex justify-end gap-3">
              <div className="bg-accent-indigo/10 border border-accent-indigo/20 p-4 rounded-2xl max-w-[80%] text-right">
                <p className="text-xs text-white font-medium">
                  {activeScenario.question}
                </p>
              </div>
            </div>
          )}

          {/* Assistant Answer */}
          {activeScenario.question && (
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-accent-indigo to-accent-purple flex items-center justify-center shrink-0 shadow-glow-indigo">
                <Sparkles className="w-4 h-4 text-white" />
              </div>
              <div className="bg-surface-hover/50 border border-border/80 p-5 rounded-2xl max-w-[85%] space-y-4 flex-1">
                
                {/* Simulated Pipeline Steps Spinner */}
                {pipelineState !== 'done' && pipelineState !== 'streaming' && (
                  <div className="flex items-center gap-2.5 py-4">
                    <span className="relative flex h-3 w-3">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent-indigo opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-3 w-3 bg-accent-indigo"></span>
                    </span>
                    <span className="text-xs font-mono text-gray-400 animate-pulse">
                      {statusMessage}
                    </span>
                  </div>
                )}

                {/* Rendered answer text */}
                {(streamedText || pipelineState === 'streaming') && (
                  <div className="text-xs text-gray-200 leading-relaxed font-sans whitespace-pre-wrap break-words">
                    {renderFormattedAnswer(streamedText)}
                  </div>
                )}

                {/* Latency Stats footer */}
                {pipelineState === 'done' && (
                  <div className="pt-3 border-t border-border/40 flex items-center justify-between text-[9px] font-mono text-gray-500">
                    <span className="flex items-center gap-1 text-accent-emerald">
                      <Zap className="w-3.5 h-3.5 text-accent-emerald" />
                      {isCacheHitActive 
                        ? 'Recalled from Engineering Memory (Fast-path cache hit)' 
                        : 'Fresh retrieval pipeline completed'}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" />
                      Latency: {isCacheHitActive ? '3ms' : '2.4s'}
                    </span>
                  </div>
                )}

              </div>
            </div>
          )}

        </div>

        {/* Input box form */}
        <form 
          onSubmit={(e) => {
            e.preventDefault();
            handleAsk(query);
          }}
          className="p-4 border-t border-border bg-background/50 flex flex-col gap-3"
        >
          <input
            type="text"
            value={githubRepo}
            onChange={(e) => setGithubRepo(e.target.value)}
            placeholder="Live LLM Mode: Paste a GitHub Repo URL (e.g. https://github.com/facebook/react) to query it live!"
            className="w-full bg-accent-indigo/5 border border-accent-indigo/30 focus:border-accent-indigo/60 px-4 py-2 rounded-lg text-[11px] text-accent-indigo placeholder-accent-indigo/50 focus:outline-none transition-colors duration-150 font-mono"
          />
          <div className="flex gap-3">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type your engineering question..."
            className="flex-1 bg-surface border border-border focus:border-border-focus px-4 py-3 rounded-xl text-xs text-white placeholder-gray-500 focus:outline-none transition-colors duration-150 font-sans"
          />
          <button
            type="submit"
            className="px-4 py-3 rounded-xl bg-accent-indigo hover:bg-accent-indigo/90 text-white flex items-center justify-center transition-colors duration-150 shadow-glow-indigo"
          >
            <Send className="w-4 h-4" />
          </button>
          </div>
        </form>

      </div>

      {/* Right Column: Citations Sidebar */}
      <div className="w-full lg:w-80 bg-surface border border-border rounded-2xl p-5 flex flex-col min-h-0">
        <h4 className="text-sm font-semibold text-white mb-4 flex items-center gap-1.5 border-b border-border/50 pb-2 shrink-0">
          <GitPullRequest className="w-4.5 h-4.5 text-accent-indigo" />
          Grounded Evidence ({activeScenario.citations.length})
        </h4>

        <div className="flex-1 overflow-y-auto space-y-3.5 pr-1.5">
          {activeScenario.citations.length > 0 ? (
            activeScenario.citations.map((citation, index) => (
              <CitationCard key={citation.sourceId || index} citation={citation} />
            ))
          ) : (
            <div className="text-center py-20 text-gray-500">
              <Brain className="w-10 h-10 text-gray-700 mx-auto mb-3 stroke-1" />
              <p className="text-xs leading-normal">
                No active evidence references found for this search frame.
              </p>
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
