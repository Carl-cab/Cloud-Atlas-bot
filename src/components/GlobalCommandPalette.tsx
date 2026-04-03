import * as React from "react"
import { useEffect, useState } from "react"
import { 
  TrendingUp, 
  TrendingDown, 
  Settings, 
  BarChart3, 
  Bot, 
  Shield, 
  Brain,
  Zap,
  Wallet,
  Activity
} from "lucide-react"
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command"
import { useToast } from "@/hooks/use-toast"

interface CommandPaletteProps {
  onNavigate?: (tab: string) => void
  onPlatformAction?: (action: string, platform?: string) => void
  onTradingAction?: (action: string) => void
}

export function GlobalCommandPalette({ 
  onNavigate, 
  onPlatformAction, 
  onTradingAction 
}: CommandPaletteProps) {
  const [open, setOpen] = useState(false)
  const { toast } = useToast()

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen((open) => !open)
      }
    }

    document.addEventListener("keydown", down)
    return () => document.removeEventListener("keydown", down)
  }, [])

  const handleCommand = (command: string, type: 'navigate' | 'platform' | 'trading') => {
    setOpen(false)
    
    switch (type) {
      case 'navigate':
        onNavigate?.(command)
        break
      case 'platform':
        onPlatformAction?.(command)
        toast({
          title: "Platform Action",
          description: `Executed: ${command}`,
        })
        break
      case 'trading':
        onTradingAction?.(command)
        toast({
          title: "Trading Action",
          description: `Executed: ${command}`,
        })
        break
    }
  }

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Type a command or search..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        
        <CommandGroup heading="Navigation">
          <CommandItem onSelect={() => handleCommand('trading', 'navigate')}>
            <Activity className="mr-2 h-4 w-4" />
            <span>Trading Dashboard</span>
          </CommandItem>
          <CommandItem onSelect={() => handleCommand('live-trading', 'navigate')}>
            <TrendingUp className="mr-2 h-4 w-4" />
            <span>Live Trading</span>
          </CommandItem>
          <CommandItem onSelect={() => handleCommand('strategies', 'navigate')}>
            <Brain className="mr-2 h-4 w-4" />
            <span>Strategies</span>
          </CommandItem>
          <CommandItem onSelect={() => handleCommand('analysis', 'navigate')}>
            <BarChart3 className="mr-2 h-4 w-4" />
            <span>Market Analysis</span>
          </CommandItem>
          <CommandItem onSelect={() => handleCommand('portfolio', 'navigate')}>
            <Wallet className="mr-2 h-4 w-4" />
            <span>Portfolio</span>
          </CommandItem>
          <CommandItem onSelect={() => handleCommand('risk', 'navigate')}>
            <Shield className="mr-2 h-4 w-4" />
            <span>Risk Management</span>
          </CommandItem>
          <CommandItem onSelect={() => handleCommand('settings', 'navigate')}>
            <Settings className="mr-2 h-4 w-4" />
            <span>Settings</span>
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Trading Actions">
          <CommandItem onSelect={() => handleCommand('start-bot', 'trading')}>
            <Bot className="mr-2 h-4 w-4" />
            <span>Start Trading Bot</span>
          </CommandItem>
          <CommandItem onSelect={() => handleCommand('stop-bot', 'trading')}>
            <Bot className="mr-2 h-4 w-4" />
            <span>Stop Trading Bot</span>
          </CommandItem>
          <CommandItem onSelect={() => handleCommand('emergency-stop', 'trading')}>
            <Zap className="mr-2 h-4 w-4" />
            <span>Emergency Stop</span>
          </CommandItem>
          <CommandItem onSelect={() => handleCommand('quick-buy', 'trading')}>
            <TrendingUp className="mr-2 h-4 w-4" />
            <span>Quick Buy Order</span>
          </CommandItem>
          <CommandItem onSelect={() => handleCommand('quick-sell', 'trading')}>
            <TrendingDown className="mr-2 h-4 w-4" />
            <span>Quick Sell Order</span>
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Platform Actions">
          <CommandItem onSelect={() => handleCommand('connect-binance', 'platform')}>
            <Activity className="mr-2 h-4 w-4" />
            <span>Connect to Binance</span>
          </CommandItem>
          <CommandItem onSelect={() => handleCommand('connect-coinbase', 'platform')}>
            <Activity className="mr-2 h-4 w-4" />
            <span>Connect to Coinbase Pro</span>
          </CommandItem>
          <CommandItem onSelect={() => handleCommand('connect-kraken', 'platform')}>
            <Activity className="mr-2 h-4 w-4" />
            <span>Connect to Kraken</span>
          </CommandItem>
          <CommandItem onSelect={() => handleCommand('sync-platforms', 'platform')}>
            <Settings className="mr-2 h-4 w-4" />
            <span>Sync All Platforms</span>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  )
}