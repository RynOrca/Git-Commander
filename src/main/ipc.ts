import { ipcMain, dialog, BrowserWindow, app } from 'electron'
import { gitService } from './git-service'

export function setupIpcHandlers() {
  console.log('[IPC] Setting up IPC handlers...')

  // 对话框操作
  ipcMain.handle('dialog:openDirectory', async () => {
    console.log('[IPC] Opening directory dialog...')
    const result = await dialog.showOpenDialog(BrowserWindow.getFocusedWindow()!, {
      properties: ['openDirectory'],
      title: '选择 Git 仓库',
    })

    if (!result.canceled && result.filePaths.length > 0) {
      const repoPath = result.filePaths[0]
      console.log('[IPC] Selected repository:', repoPath)
      return repoPath
    }
    return null
  })

  ipcMain.handle('dialog:createDirectory', async () => {
    console.log('[IPC] Creating directory dialog...')
    const result = await dialog.showOpenDialog(BrowserWindow.getFocusedWindow()!, {
      properties: ['openDirectory', 'createDirectory'],
      title: '选择新建仓库目录',
    })

    if (!result.canceled && result.filePaths.length > 0) {
      const repoPath = result.filePaths[0]
      console.log('[IPC] Selected directory for new repo:', repoPath)
      return repoPath
    }
    return null
  })

  // Git 仓库操作
  ipcMain.handle('git:open', async (_, repoPath: string) => {
    console.log('[IPC] Opening repository:', repoPath)
    return await gitService.open(repoPath)
  })

  ipcMain.handle('git:init', async (_, repoPath: string) => {
    console.log('[IPC] Initializing git in:', repoPath)
    return await gitService.init(repoPath)
  })

  ipcMain.handle('git:isRepo', async (_, path: string) => {
    console.log('[IPC] Checking if path is repo:', path)
    return await gitService.isRepo(path)
  })

  // Git 状态和分支
  ipcMain.handle('git:status', async (_, path: string) => {
    console.log('[IPC] Getting git status for:', path)
    return await gitService.status(path)
  })

  ipcMain.handle('git:currentBranch', async (_, path: string) => {
    console.log('[IPC] Getting current branch for:', path)
    return await gitService.currentBranch(path)
  })

  ipcMain.handle('git:branches', async (_, path: string) => {
    console.log('[IPC] Getting branches for:', path)
    return await gitService.branches(path)
  })

  // Git 提交操作
  ipcMain.handle('git:add', async (_, path: string, files: string[]) => {
    console.log('[IPC] Adding files to:', path, 'files:', files)
    return await gitService.add(path, files)
  })

  ipcMain.handle('git:reset', async (_, path: string, files: string[]) => {
    console.log('[IPC] Resetting files in:', path, 'files:', files)
    return await gitService.reset(path, files)
  })

  ipcMain.handle('git:commit', async (_, path: string, message: string) => {
    console.log('[IPC] Committing to:', path, 'message:', message)
    return await gitService.commit(path, message)
  })

  // Git 远程操作
  ipcMain.handle('git:clone', async (_, url: string, path: string) => {
    console.log('[IPC] Cloning from:', url, 'to:', path)
    return await gitService.clone(url, path)
  })

  ipcMain.handle('git:addRemote', async (_, path: string, name: string, url: string) => {
    console.log('[IPC] Adding remote to:', path, 'name:', name, 'url:', url)
    return await gitService.addRemote(path, name, url)
  })

  ipcMain.handle('git:getRemotes', async (_, path: string) => {
    console.log('[IPC] Getting remotes for:', path)
    return await gitService.getRemotes(path)
  })

  ipcMain.handle('git:push', async (_, path: string, remote?: string, branch?: string) => {
    console.log('[IPC] Pushing from:', path, 'remote:', remote || 'default', 'branch:', branch || 'current')
    return await gitService.push(path, remote, branch)
  })

  ipcMain.handle('git:pull', async (_, path: string) => {
    console.log('[IPC] Pulling to:', path)
    return await gitService.pull(path)
  })

  ipcMain.handle('git:fetch', async (_, path: string) => {
    console.log('[IPC] Fetching for:', path)
    return await gitService.fetch(path)
  })

  // Git 分支操作
  ipcMain.handle('git:createBranch', async (_, path: string, name: string) => {
    console.log('[IPC] Creating branch in:', path, 'name:', name)
    return await gitService.createBranch(path, name)
  })

  ipcMain.handle('git:deleteBranch', async (_, path: string, name: string, force: boolean = false) => {
    console.log('[IPC] Deleting branch in:', path, 'name:', name, 'force:', force)
    return await gitService.deleteBranch(path, name, force)
  })

  ipcMain.handle('git:checkout', async (_, path: string, branch: string) => {
    console.log('[IPC] Checking out branch in:', path, 'branch:', branch)
    return await gitService.checkout(path, branch)
  })

  ipcMain.handle('git:merge', async (_, path: string, branch: string) => {
    console.log('[IPC] Merging branch in:', path, 'branch:', branch)
    return await gitService.merge(path, branch)
  })

  // Git 文件操作
  ipcMain.handle('git:checkoutFile', async (_, path: string, file: string) => {
    console.log('[IPC] Checking out file in:', path, 'file:', file)
    return await gitService.checkoutFile(path, file)
  })

  // Git 日志和差异
  ipcMain.handle('git:log', async (_, path: string, maxCount: number = 50) => {
    console.log('[IPC] Getting git log for:', path, 'maxCount:', maxCount)
    return await gitService.log(path, maxCount)
  })

  ipcMain.handle('git:diff', async (_, path: string, file?: string) => {
    console.log('[IPC] Getting git diff for:', path, 'file:', file || 'all')
    return await gitService.diff(path, file)
  })

  ipcMain.handle('git:diffCached', async (_, path: string) => {
    console.log('[IPC] Getting git diff --cached for:', path)
    return await gitService.diffCached(path)
  })

  // Git 分支快捷操作（兼容旧版本）
  ipcMain.handle('git:branch', async (_, path: string) => {
    console.log('[IPC] Getting git branch for:', path)
    try {
      const { simpleGit } = await import('simple-git')
      const git = simpleGit(path)
      const branch = await git.branch()
      return { success: true, branch }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  })

  // 应用信息
  ipcMain.handle('app:getVersion', () => {
    console.log('[IPC] Getting app version...')
    return app.getVersion()
  })

  // 测试
  ipcMain.handle('test:ipc', async (_, message: string) => {
    console.log('[IPC] Test IPC received:', message)
    return `IPC Response: ${message}`
  })

  console.log('[IPC] IPC handlers setup complete')
}