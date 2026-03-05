export interface ElectronAPI {
  platform: string
  isDev: boolean
  
  dialog: {
    openDirectory: () => Promise<string | null>
    createDirectory: () => Promise<string | null>
  }
  
  git: {
    // 仓库操作
    isRepo: (path: string) => Promise<boolean>
    init: (path: string) => Promise<{ success: boolean; error?: string }>
    open: (path: string) => Promise<{ success: boolean; error?: string }>
    clone: (url: string, path: string) => Promise<{ success: boolean; error?: string }>
    
    // 状态和分支
    status: (path: string) => Promise<{ success: boolean; status?: any; error?: string }>
    currentBranch: (path: string) => Promise<{ success: boolean; branch?: string; error?: string }>
    branches: (path: string) => Promise<{ success: boolean; branches?: any; error?: string }>
    createBranch: (path: string, name: string) => Promise<{ success: boolean; error?: string }>
    checkout: (path: string, branch: string) => Promise<{ success: boolean; error?: string }>
    
    // 提交操作
    add: (path: string, files: string[]) => Promise<{ success: boolean; error?: string }>
    reset: (path: string, files: string[]) => Promise<{ success: boolean; error?: string }>
    commit: (path: string, message: string) => Promise<{ success: boolean; error?: string }>
    
    // 远程操作
    addRemote: (path: string, name: string, url: string) => Promise<{ success: boolean; error?: string }>
    getRemotes: (path: string) => Promise<{ success: boolean; remotes?: string[]; error?: string }>
    push: (path: string, remote?: string, branch?: string) => Promise<{ success: boolean; error?: string }>
    pull: (path: string) => Promise<{ success: boolean; error?: string }>
    fetch: (path: string) => Promise<{ success: boolean; error?: string }>
    
    // 日志和差异
    log: (path: string, maxCount?: number) => Promise<{ success: boolean; commits?: any[]; error?: string }>
    diff: (path: string, file?: string) => Promise<{ success: boolean; diff?: string; error?: string }>
    diffCached: (path: string) => Promise<{ success: boolean; diff?: string; error?: string }>
    
    // 其他操作
    checkoutFile: (path: string, file: string) => Promise<{ success: boolean; error?: string }>
    merge: (path: string, branch: string) => Promise<{ success: boolean; error?: string }>
    deleteBranch: (path: string, name: string, force?: boolean) => Promise<{ success: boolean; error?: string }>
  }
  
  app: {
    getVersion: () => Promise<string>
  }
  
  testIpc: (message: string) => Promise<string>
  
  onMenuOpenRepository: (callback: () => void) => () => void
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}