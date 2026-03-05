import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  // 平台信息
  platform: process.platform,
  isDev: process.env.NODE_ENV !== 'production',
  
  // 对话框
  dialog: {
    openDirectory: () => ipcRenderer.invoke('dialog:openDirectory'),
    createDirectory: () => ipcRenderer.invoke('dialog:createDirectory'),
  },
  
  // Git 操作
  git: {
    // 仓库操作
    isRepo: (path: string) => ipcRenderer.invoke('git:isRepo', path),
    init: (path: string) => ipcRenderer.invoke('git:init', path),
    open: (path: string) => ipcRenderer.invoke('git:open', path),
    clone: (url: string, path: string) => ipcRenderer.invoke('git:clone', url, path),
    
    // 状态和分支
    status: (path: string) => ipcRenderer.invoke('git:status', path),
    currentBranch: (path: string) => ipcRenderer.invoke('git:currentBranch', path),
    branches: (path: string) => ipcRenderer.invoke('git:branches', path),
    createBranch: (path: string, name: string) => ipcRenderer.invoke('git:createBranch', path, name),
    checkout: (path: string, branch: string) => ipcRenderer.invoke('git:checkout', path, branch),
    
    // 提交操作
    add: (path: string, files: string[]) => ipcRenderer.invoke('git:add', path, files),
    reset: (path: string, files: string[]) => ipcRenderer.invoke('git:reset', path, files),
    commit: (path: string, message: string) => ipcRenderer.invoke('git:commit', path, message),
    
    // 远程操作
    addRemote: (path: string, name: string, url: string) => ipcRenderer.invoke('git:addRemote', path, name, url),
    getRemotes: (path: string) => ipcRenderer.invoke('git:getRemotes', path),
    push: (path: string, remote?: string, branch?: string) => ipcRenderer.invoke('git:push', path, remote, branch),
    pull: (path: string) => ipcRenderer.invoke('git:pull', path),
    fetch: (path: string) => ipcRenderer.invoke('git:fetch', path),
    
    // 日志和差异
    log: (path: string, maxCount?: number) => ipcRenderer.invoke('git:log', path, maxCount),
    diff: (path: string, file?: string) => ipcRenderer.invoke('git:diff', path, file),
    diffCached: (path: string) => ipcRenderer.invoke('git:diffCached', path),
    
    // 其他操作
    checkoutFile: (path: string, file: string) => ipcRenderer.invoke('git:checkoutFile', path, file),
    merge: (path: string, branch: string) => ipcRenderer.invoke('git:merge', path, branch),
    deleteBranch: (path: string, name: string, force?: boolean) => ipcRenderer.invoke('git:deleteBranch', path, name, force),
  },
  
  // 应用信息
  app: {
    getVersion: () => ipcRenderer.invoke('app:getVersion'),
  },
  
  // 测试
  testIpc: (message: string) => ipcRenderer.invoke('test:ipc', message),
  
  // 菜单事件
  onMenuOpenRepository: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on('menu:open-repository', handler)
    return () => {
      ipcRenderer.removeListener('menu:open-repository', handler)
    }
  },
})