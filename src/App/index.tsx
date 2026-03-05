import { useState, useEffect, useCallback } from 'react'

interface Toast {
  id: number
  message: string
  type: 'success' | 'error' | 'info'
}

interface RepoInfo {
  isGitRepo: boolean
  currentBranch?: string
  hasChanges: boolean
}

const MAX_RECENT_REPOS = 5
const STORAGE_KEY = 'git-commander-recent-repos'

function App() {
  const [githubUrl, setGithubUrl] = useState('')
  const [folderPath, setFolderPath] = useState('')
  const [repoInfo, setRepoInfo] = useState<RepoInfo>({
    isGitRepo: false,
    hasChanges: false,
  })
  const [logs, setLogs] = useState<string[]>([])
  const [toasts, setToasts] = useState<Toast[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [currentOperation, setCurrentOperation] = useState('')
  const [recentRepos, setRecentRepos] = useState<Array<{path: string, name: string}>>([])
  const [showCommitDialog, setShowCommitDialog] = useState(false)
  const [commitMessage, setCommitMessage] = useState('')
  const [pendingPush, setPendingPush] = useState(false)

  // 添加日志
  const addLog = useCallback((message: string) => {
    const timestamp = new Date().toLocaleTimeString()
    setLogs(prev => [...prev, `[${timestamp}] ${message}`])
  }, [])

  // 显示 Toast
  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info') => {
    const id = Date.now()
    setToasts(prev => [...prev, { id, message, type }])
    setTimeout(() => {
      setToasts(prev => prev.filter(toast => toast.id !== id))
    }, 3000)
  }, [])

  // 保存最近仓库
  const saveRecentRepo = useCallback((path: string) => {
    try {
      const name = path.split(/[\\/]/).pop() || path
      const newRepo = { path, name }
      const updated = [newRepo, ...recentRepos.filter(r => r.path !== path)].slice(0, MAX_RECENT_REPOS)
      setRecentRepos(updated)
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
    } catch (error) {
      console.error('保存最近仓库失败:', error)
    }
  }, [recentRepos])

  // 选择文件夹
  const selectFolder = useCallback(async () => {
    try {
      const result = await window.electronAPI.dialog.openDirectory()
      if (result) {
        setFolderPath(result)
        saveRecentRepo(result)
        addLog(`已选择文件夹：${result}`)
        checkRepoStatus(result)
      }
    } catch (error) {
      showToast('选择文件夹失败', 'error')
      addLog(`选择文件夹失败：${error}`)
    }
  }, [addLog, showToast, saveRecentRepo])

  // 检查仓库状态
  const checkRepoStatus = useCallback(async (path: string) => {
    if (!path) return
    
    try {
      setIsLoading(true)
      setCurrentOperation('检查仓库状态...')
      
      const isRepo = await window.electronAPI.git.isRepo(path)
      let repoInfo: RepoInfo = {
        isGitRepo: isRepo,
        hasChanges: false,
      }
      
      if (isRepo) {
        const currentBranchResult = await window.electronAPI.git.currentBranch(path)
        const status = await window.electronAPI.git.status(path)
        
        repoInfo = {
          ...repoInfo,
          currentBranch: currentBranchResult.success && currentBranchResult.branch ? currentBranchResult.branch : 'unknown',
          hasChanges: status.success && status.status ? 
          (status.status.staged?.length || 0) + (status.status.modified?.length || 0) + 
          (status.status.deleted?.length || 0) + (status.status.untracked?.length || 0) > 0 : false,
        }
        
        addLog(`检测到 Git 仓库，当前分支：${currentBranchResult.success && currentBranchResult.branch ? currentBranchResult.branch : 'unknown'}`)
        showToast('已加载 Git 仓库', 'success')
      } else {
        addLog('文件夹不是 Git 仓库')
      }
      
      setRepoInfo(repoInfo)
    } catch (error) {
      console.error('检查仓库状态失败:', error)
      addLog(`检查仓库状态失败：${error}`)
    } finally {
      setIsLoading(false)
      setCurrentOperation('')
    }
  }, [addLog, showToast])

  // 初始化仓库
  const initRepo = useCallback(async () => {
    if (!folderPath) {
      showToast('请先选择文件夹', 'error')
      return
    }
    
    try {
      setIsLoading(true)
      setCurrentOperation('初始化 Git 仓库...')
      addLog('正在初始化 Git 仓库...')
      
      const initResult = await window.electronAPI.git.init(folderPath)
      if (!initResult.success) {
        throw new Error(`初始化失败：${initResult.error}`)
      }
      
      setRepoInfo({
        isGitRepo: true,
        currentBranch: 'main',
        hasChanges: false,
      })
      
      addLog('Git 仓库初始化成功')
      showToast('Git 仓库初始化成功', 'success')
      
      // 如果提供了 GitHub URL，添加远程仓库
      if (githubUrl) {
        addLog(`正在添加远程仓库：${githubUrl}`)
        try {
          const addRemoteResult = await window.electronAPI.git.addRemote(folderPath, 'origin', githubUrl)
          if (!addRemoteResult.success) {
            addLog(`添加远程仓库失败：${addRemoteResult.error}`)
            showToast('添加远程仓库失败', 'error')
          } else {
            addLog('远程仓库添加成功')
            showToast('远程仓库添加成功', 'success')
          }
        } catch (error) {
          addLog(`添加远程仓库失败：${error}`)
          // 不阻止初始化成功，只是记录错误
        }
      }
    } catch (error) {
      console.error('初始化仓库失败:', error)
      addLog(`初始化仓库失败：${error}`)
      showToast('初始化仓库失败', 'error')
    } finally {
      setIsLoading(false)
      setCurrentOperation('')
    }
  }, [folderPath, githubUrl, addLog, showToast])

  // 确保远程仓库存在，如果不存在且提供了 GitHub URL，则自动添加
  const ensureRemoteExists = useCallback(async (path: string): Promise<boolean> => {
    try {
      // 检查是否有远程仓库
      const remotesResult = await window.electronAPI.git.getRemotes(path)
      if (remotesResult.success && remotesResult.remotes && remotesResult.remotes.length > 0) {
        addLog(`已有远程仓库：${remotesResult.remotes.join(', ')}`)
        return true
      }
      
      // 没有远程仓库，检查是否有 GitHub URL
      if (!githubUrl) {
        addLog('没有远程仓库且未提供 GitHub URL')
        showToast('请先设置 GitHub 仓库 URL', 'error')
        return false
      }
      
      // 添加远程仓库
      addLog(`添加远程仓库：origin -> ${githubUrl}`)
      const addRemoteResult = await window.electronAPI.git.addRemote(path, 'origin', githubUrl)
      if (!addRemoteResult.success) {
        addLog(`添加远程仓库失败：${addRemoteResult.error}`)
        showToast('添加远程仓库失败', 'error')
        return false
      }
      
      addLog('远程仓库添加成功')
      showToast('远程仓库添加成功', 'success')
      return true
    } catch (error) {
      console.error('检查远程仓库失败:', error)
      addLog(`检查远程仓库失败：${error}`)
      return false
    }
  }, [githubUrl, addLog, showToast])

  // 执行提交和推送的完整流程
  const executeCommitAndPush = useCallback(async (message: string) => {
    if (!folderPath) {
      showToast('请先选择文件夹', 'error')
      return
    }
    
    if (!repoInfo.isGitRepo) {
      showToast('请先初始化 Git 仓库', 'error')
      return
    }
    
    try {
      setIsLoading(true)
      setCurrentOperation('正在提交更改...')
      addLog('正在提交更改...')
      
      const addResult = await window.electronAPI.git.add(folderPath, ['.'])
      if (!addResult.success) {
        throw new Error(`添加更改失败：${addResult.error}`)
      }
      addLog('添加成功')
      
      const commitResult = await window.electronAPI.git.commit(folderPath, message)
      if (!commitResult.success) {
        throw new Error(`提交失败：${commitResult.error}`)
      }
      addLog('提交成功')
      
      setCurrentOperation('推送更改到远程仓库...')
      addLog('正在推送更改到远程仓库...')
      
      // 确保远程仓库存在
      const hasRemote = await ensureRemoteExists(folderPath)
      if (!hasRemote) {
        throw new Error('无法推送：远程仓库未配置')
      }
      
      const pushResult = await window.electronAPI.git.push(folderPath)
      if (!pushResult.success) {
        throw new Error(`推送失败：${pushResult.error}`)
      }
      
      addLog('推送成功')
      showToast('提交并推送成功', 'success')
      
      checkRepoStatus(folderPath)
    } catch (error) {
      console.error('提交并推送失败:', error)
      addLog(`提交并推送失败：${error}`)
      showToast('提交并推送失败', 'error')
    } finally {
      setIsLoading(false)
      setCurrentOperation('')
    }
  }, [folderPath, repoInfo.isGitRepo, addLog, showToast, checkRepoStatus, ensureRemoteExists])
  
  // 一键上传
  const pushToRemote = useCallback(async () => {
    if (!folderPath) {
      showToast('请先选择文件夹', 'error')
      return
    }
    
    if (!repoInfo.isGitRepo) {
      showToast('请先初始化 Git 仓库', 'error')
      return
    }
    
    try {
      setIsLoading(true)
      setCurrentOperation('检查仓库状态...')
      addLog('检查仓库状态...')
      
      const status = await window.electronAPI.git.status(folderPath)
      const hasChanges = status.success && status.status && 
        ((status.status.staged?.length || 0) + (status.status.modified?.length || 0) + 
         (status.status.deleted?.length || 0) + (status.status.untracked?.length || 0) > 0)
      
      if (hasChanges) {
        addLog('检测到未提交的更改，需要提交后才能推送')
        setPendingPush(true)
        setCommitMessage('')
        setShowCommitDialog(true)
        showToast('请输入提交信息', 'info')
      } else {
        addLog('没有未提交的更改，直接推送...')
        
        // 确保远程仓库存在
        const hasRemote = await ensureRemoteExists(folderPath)
        if (!hasRemote) {
          throw new Error('无法推送：远程仓库未配置')
        }
        
        setCurrentOperation('推送更改到远程仓库...')
        const pushResult = await window.electronAPI.git.push(folderPath)
        if (!pushResult.success) {
          throw new Error(`推送失败：${pushResult.error}`)
        }
        addLog('推送成功')
        showToast('推送成功', 'success')
      }
    } catch (error) {
      console.error('推送失败:', error)
      addLog(`推送失败：${error}`)
      showToast('推送失败', 'error')
    } finally {
      setIsLoading(false)
      setCurrentOperation('')
    }
  }, [folderPath, repoInfo.isGitRepo, addLog, showToast, ensureRemoteExists])
  
  // 处理提交对话框
  const handleCommitConfirm = useCallback(async () => {
    if (!commitMessage.trim()) {
      showToast('请输入提交信息', 'error')
      return
    }
    
    setShowCommitDialog(false)
    
    if (pendingPush) {
      await executeCommitAndPush(commitMessage)
      setPendingPush(false)
    } else {
      try {
        setIsLoading(true)
        setCurrentOperation('正在提交更改...')
        addLog('正在提交更改...')
        
        const addResult = await window.electronAPI.git.add(folderPath, ['.'])
        if (!addResult.success) {
          throw new Error(`添加更改失败：${addResult.error}`)
        }
        addLog('添加成功')
        
        const commitResult = await window.electronAPI.git.commit(folderPath, commitMessage)
        if (!commitResult.success) {
          throw new Error(`提交失败：${commitResult.error}`)
        }
        addLog('提交成功')
        showToast('提交成功', 'success')
        
        checkRepoStatus(folderPath)
      } catch (error) {
        console.error('提交失败:', error)
        addLog(`提交失败：${error}`)
        showToast('提交失败', 'error')
      } finally {
        setIsLoading(false)
        setCurrentOperation('')
      }
    }
    
    setCommitMessage('')
  }, [commitMessage, pendingPush, folderPath, showToast, addLog, executeCommitAndPush, checkRepoStatus])
  
  const handleCommitCancel = useCallback(() => {
    setShowCommitDialog(false)
    setPendingPush(false)
    setCommitMessage('')
  }, [])
  
  // 独立提交按钮
  const commitChanges = useCallback(() => {
    if (!folderPath) {
      showToast('请先选择文件夹', 'error')
      return
    }
    
    if (!repoInfo.isGitRepo) {
      showToast('请先初始化 Git 仓库', 'error')
      return
    }
    
    window.electronAPI.git.status(folderPath).then(status => {
      const hasChanges = status.success && status.status && 
        ((status.status.staged?.length || 0) + (status.status.modified?.length || 0) + 
         (status.status.deleted?.length || 0) + (status.status.untracked?.length || 0) > 0)
      
      if (hasChanges) {
        setPendingPush(false)
        setCommitMessage('')
        setShowCommitDialog(true)
        showToast('请输入提交信息', 'info')
      } else {
        showToast('没有需要提交的更改', 'info')
      }
    })
  }, [folderPath, repoInfo.isGitRepo, showToast])

  // 一键拉取
  const pullFromRemote = useCallback(async () => {
    if (!folderPath) {
      showToast('请先选择文件夹', 'error')
      return
    }
    
    if (!repoInfo.isGitRepo) {
      showToast('请先初始化 Git 仓库', 'error')
      return
    }
    
    try {
      setIsLoading(true)
      setCurrentOperation('从远程仓库拉取更改...')
      addLog('正在从远程仓库拉取更改...')
      
      const pullResult = await window.electronAPI.git.pull(folderPath)
      if (!pullResult.success) {
        throw new Error(`拉取失败：${pullResult.error}`)
      }
      
      addLog('拉取成功')
      showToast('拉取成功', 'success')
      
      checkRepoStatus(folderPath)
    } catch (error) {
      console.error('拉取失败:', error)
      addLog(`拉取失败：${error}`)
      showToast('拉取失败', 'error')
    } finally {
      setIsLoading(false)
      setCurrentOperation('')
    }
  }, [folderPath, repoInfo.isGitRepo, addLog, showToast, checkRepoStatus])

  // 一键获取
  const fetchFromRemote = useCallback(async () => {
    if (!folderPath) {
      showToast('请先选择文件夹', 'error')
      return
    }
    
    if (!repoInfo.isGitRepo) {
      showToast('请先初始化 Git 仓库', 'error')
      return
    }
    
    try {
      setIsLoading(true)
      setCurrentOperation('获取远程仓库更新...')
      addLog('正在获取远程仓库更新...')
      
      const fetchResult = await window.electronAPI.git.fetch(folderPath)
      if (!fetchResult.success) {
        throw new Error(`获取失败：${fetchResult.error}`)
      }
      
      addLog('获取成功')
      showToast('获取成功', 'success')
    } catch (error) {
      console.error('获取失败:', error)
      addLog(`获取失败：${error}`)
      showToast('获取失败', 'error')
    } finally {
      setIsLoading(false)
      setCurrentOperation('')
    }
  }, [folderPath, repoInfo.isGitRepo, addLog, showToast])

  // 克隆仓库
  const cloneRepo = useCallback(async () => {
    if (!githubUrl) {
      showToast('请输入 GitHub 仓库 URL', 'error')
      return
    }
    
    if (!folderPath) {
      showToast('请选择保存文件夹', 'error')
      return
    }
    
    try {
      setIsLoading(true)
      setCurrentOperation('正在克隆仓库...')
      addLog(`正在克隆仓库：${githubUrl}`)
      
      const cloneResult = await window.electronAPI.git.clone(githubUrl, folderPath)
      if (!cloneResult.success) {
        throw new Error(`克隆失败：${cloneResult.error}`)
      }
      
      addLog('克隆成功')
      showToast('克隆成功', 'success')
      
      saveRecentRepo(folderPath)
      checkRepoStatus(folderPath)
    } catch (error) {
      console.error('克隆失败:', error)
      addLog(`克隆失败：${error}`)
      showToast('克隆失败', 'error')
    } finally {
      setIsLoading(false)
      setCurrentOperation('')
    }
  }, [githubUrl, folderPath, addLog, showToast, saveRecentRepo])

  // 加载最近仓库
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        setRecentRepos(JSON.parse(saved))
      }
    } catch (error) {
      console.error('加载最近仓库失败:', error)
    }
  }, [])

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      padding: '20px',
      fontFamily: 'system-ui, -apple-system, sans-serif',
    }}>
      <div style={{
        maxWidth: '1400px',
        margin: '0 auto',
        background: 'white',
        borderRadius: '16px',
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        overflow: 'hidden',
      }}>
        {/* 头部 */}
        <div style={{
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          color: 'white',
          padding: '30px',
          textAlign: 'center',
        }}>
          <h1 style={{ margin: '0 0 10px 0', fontSize: '32px', fontWeight: 'bold' }}>
            <i className="fa-brands fa-git-alt"></i> Git Commander
          </h1>
          <p style={{ margin: 0, opacity: 0.9 }}>Git 图形化操作工具 - 让 Git 变得更简单</p>
        </div>

        {/* 主内容区 */}
        <div style={{ padding: '30px' }}>
          {/* 输入区域 */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '20px',
            marginBottom: '30px',
          }}>
            {/* GitHub URL 输入 */}
            <div>
              <label style={{
                display: 'block',
                marginBottom: '8px',
                fontWeight: '600',
                color: '#374151',
              }}>
                <i className="fa-brands fa-github"></i> GitHub 仓库 URL
              </label>
              <input
                type="text"
                value={githubUrl}
                onChange={(e) => setGithubUrl(e.target.value)}
                placeholder="https://github.com/username/repo.git"
                style={{
                  width: '100%',
                  padding: '12px',
                  border: '2px solid #e5e7eb',
                  borderRadius: '8px',
                  fontSize: '14px',
                  boxSizing: 'border-box',
                  outline: 'none',
                  transition: 'border-color 0.2s',
                }}
                onFocus={(e) => e.target.style.borderColor = '#667eea'}
                onBlur={(e) => e.target.style.borderColor = '#e5e7eb'}
              />
            </div>

            {/* 文件夹选择 */}
            <div>
              <label style={{
                display: 'block',
                marginBottom: '8px',
                fontWeight: '600',
                color: '#374151',
              }}>
                <i className="fa-solid fa-folder"></i> 本地文件夹
              </label>
              <div style={{ display: 'flex', gap: '10px' }}>
                <input
                  type="text"
                  value={folderPath}
                  readOnly
                  placeholder="点击'选择文件夹'按钮"
                  style={{
                    flex: 1,
                    padding: '12px',
                    border: '2px solid #e5e7eb',
                    borderRadius: '8px',
                    fontSize: '14px',
                    background: '#f9fafb',
                    color: '#6b7280',
                  }}
                />
                <button
                  onClick={selectFolder}
                  style={{
                    padding: '12px 24px',
                    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    fontWeight: '600',
                    cursor: 'pointer',
                    transition: 'transform 0.2s',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-2px)'}
                  onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}
                >
                  <i className="fa-solid fa-folder-open"></i> 选择
                </button>
              </div>
            </div>
          </div>

          {/* 最近仓库 */}
          {recentRepos.length > 0 && (
            <div style={{
              marginBottom: '30px',
              padding: '16px',
              background: '#f9fafb',
              borderRadius: '8px',
            }}>
              <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: '600', color: '#6b7280' }}>
                <i className="fa-solid fa-history"></i> 最近仓库
              </h3>
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                {recentRepos.map((repo, index) => (
                  <button
                    key={index}
                    onClick={() => {
                      setFolderPath(repo.path)
                      checkRepoStatus(repo.path)
                    }}
                    style={{
                      padding: '8px 16px',
                      background: 'white',
                      border: '2px solid #e5e7eb',
                      borderRadius: '8px',
                      fontSize: '13px',
                      color: '#374151',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = '#667eea'
                      e.currentTarget.style.transform = 'translateY(-2px)'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = '#e5e7eb'
                      e.currentTarget.style.transform = 'translateY(0)'
                    }}
                  >
                    <i className="fa-solid fa-folder"></i> {repo.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 仓库状态 */}
          {repoInfo.isGitRepo && (
            <div style={{
              marginBottom: '30px',
              padding: '16px',
              background: '#ecfdf5',
              border: '2px solid #10b981',
              borderRadius: '8px',
              color: '#065f46',
            }}>
              <i className="fa-solid fa-check-circle"></i> Git 仓库已加载
              {' - '}
              当前分支：{repoInfo.currentBranch}
              {' - '}
              {repoInfo.hasChanges ? '有未提交的更改' : '工作区干净'}
            </div>
          )}

          {/* 操作按钮 */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '16px',
            marginBottom: '30px',
          }}>
            <button
              onClick={initRepo}
              disabled={!folderPath}
              style={{
                padding: '16px',
                background: folderPath ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)' : '#d1d5db',
                color: 'white',
                border: 'none',
                borderRadius: '12px',
                fontWeight: '600',
                fontSize: '15px',
                cursor: folderPath ? 'pointer' : 'not-allowed',
                transition: 'all 0.2s',
              }}
              onMouseEnter={(e) => folderPath && (e.currentTarget.style.transform = 'translateY(-2px)')}
              onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}
            >
              <i className="fa-solid fa-plus-circle"></i> 初始化仓库
            </button>

            <button
              onClick={pushToRemote}
              disabled={!folderPath || !repoInfo.isGitRepo}
              style={{
                padding: '16px',
                background: (folderPath && repoInfo.isGitRepo) ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' : '#d1d5db',
                color: 'white',
                border: 'none',
                borderRadius: '12px',
                fontWeight: '600',
                fontSize: '15px',
                cursor: (folderPath && repoInfo.isGitRepo) ? 'pointer' : 'not-allowed',
                transition: 'all 0.2s',
              }}
              onMouseEnter={(e) => folderPath && repoInfo.isGitRepo && (e.currentTarget.style.transform = 'translateY(-2px)')}
              onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}
            >
              <i className="fa-solid fa-upload"></i> 一键上传
            </button>

            <button
              onClick={pullFromRemote}
              disabled={!folderPath || !repoInfo.isGitRepo}
              style={{
                padding: '16px',
                background: (folderPath && repoInfo.isGitRepo) ? 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)' : '#d1d5db',
                color: 'white',
                border: 'none',
                borderRadius: '12px',
                fontWeight: '600',
                fontSize: '15px',
                cursor: (folderPath && repoInfo.isGitRepo) ? 'pointer' : 'not-allowed',
                transition: 'all 0.2s',
              }}
              onMouseEnter={(e) => folderPath && repoInfo.isGitRepo && (e.currentTarget.style.transform = 'translateY(-2px)')}
              onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}
            >
              <i className="fa-solid fa-download"></i> 一键拉取
            </button>

            <button
              onClick={fetchFromRemote}
              disabled={!folderPath || !repoInfo.isGitRepo}
              style={{
                padding: '16px',
                background: (folderPath && repoInfo.isGitRepo) ? 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)' : '#d1d5db',
                color: 'white',
                border: 'none',
                borderRadius: '12px',
                fontWeight: '600',
                fontSize: '15px',
                cursor: (folderPath && repoInfo.isGitRepo) ? 'pointer' : 'not-allowed',
                transition: 'all 0.2s',
              }}
              onMouseEnter={(e) => folderPath && repoInfo.isGitRepo && (e.currentTarget.style.transform = 'translateY(-2px)')}
              onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}
            >
              <i className="fa-solid fa-sync"></i> 一键获取
            </button>

            <button
              onClick={commitChanges}
              disabled={!folderPath || !repoInfo.isGitRepo}
              style={{
                padding: '16px',
                background: (folderPath && repoInfo.isGitRepo) ? 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)' : '#d1d5db',
                color: 'white',
                border: 'none',
                borderRadius: '12px',
                fontWeight: '600',
                fontSize: '15px',
                cursor: (folderPath && repoInfo.isGitRepo) ? 'pointer' : 'not-allowed',
                transition: 'all 0.2s',
              }}
              onMouseEnter={(e) => folderPath && repoInfo.isGitRepo && (e.currentTarget.style.transform = 'translateY(-2px)')}
              onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}
            >
              <i className="fa-solid fa-save"></i> 提交更改
            </button>

            <button
              onClick={cloneRepo}
              disabled={!githubUrl || !folderPath}
              style={{
                padding: '16px',
                background: (githubUrl && folderPath) ? 'linear-gradient(135deg, #ec4899 0%, #db2777 100%)' : '#d1d5db',
                color: 'white',
                border: 'none',
                borderRadius: '12px',
                fontWeight: '600',
                fontSize: '15px',
                cursor: (githubUrl && folderPath) ? 'pointer' : 'not-allowed',
                transition: 'all 0.2s',
              }}
              onMouseEnter={(e) => githubUrl && folderPath && (e.currentTarget.style.transform = 'translateY(-2px)')}
              onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}
            >
              <i className="fa-solid fa-copy"></i> 克隆仓库
            </button>
          </div>

          {/* 日志区域 */}
          <div style={{
            background: '#1f2937',
            color: '#10b981',
            borderRadius: '12px',
            padding: '20px',
            fontFamily: 'Consolas, Monaco, monospace',
            fontSize: '13px',
            maxHeight: '300px',
            overflowY: 'auto',
          }}>
            <h3 style={{ margin: '0 0 12px 0', color: '#9ca3af' }}>
              <i className="fa-solid fa-terminal"></i> 操作日志
            </h3>
            <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
              {logs.length === 0 ? (
                <span style={{ color: '#6b7280' }}>暂无日志...</span>
              ) : (
                logs.map((log, index) => (
                  <div key={index}>{log}</div>
                ))
              )}
            </div>
          </div>
          
          {/* 温馨提示 */}
          <div style={{
            marginTop: '30px',
            padding: '20px',
            background: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)',
            borderRadius: '12px',
            border: '2px solid #f59e0b',
          }}>
            <h3 style={{ 
              margin: '0 0 15px 0', 
              fontSize: '18px', 
              fontWeight: 'bold',
              color: '#92400e',
              display: 'flex',
              alignItems: 'center',
            }}>
              <i className="fa-solid fa-circle-info" style={{ marginRight: '10px', fontSize: '24px' }}></i>
              💡 温馨提示 & 使用指南
            </h3>
            
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
              gap: '15px',
            }}>
              {/* 基本流程 */}
              <div style={{
                background: 'white',
                padding: '15px',
                borderRadius: '8px',
                border: '1px solid #fcd34d',
              }}>
                <h4 style={{ 
                  margin: '0 0 10px 0', 
                  fontSize: '16px', 
                  fontWeight: 'bold',
                  color: '#92400e',
                }}>
                  <i className="fa-solid fa-list-check"></i> 基本操作流程
                </h4>
                <ol style={{ 
                  margin: 0, 
                  paddingLeft: '20px',
                  color: '#78350f',
                  lineHeight: '1.8',
                }}>
                  <li><strong>开始工作前</strong>：先点击"一键拉取"获取最新代码</li>
                  <li><strong>修改代码</strong>：在本地进行修改、添加或删除文件</li>
                  <li><strong>提交更改</strong>：点击"提交更改"或"一键上传"</li>
                  <li><strong>推送代码</strong>：应用会自动完成 add → commit → push</li>
                </ol>
              </div>
              
              {/* 按钮功能说明 */}
              <div style={{
                background: 'white',
                padding: '15px',
                borderRadius: '8px',
                border: '1px solid #fcd34d',
              }}>
                <h4 style={{ 
                  margin: '0 0 10px 0', 
                  fontSize: '16px', 
                  fontWeight: 'bold',
                  color: '#92400e',
                }}>
                  <i className="fa-solid fa-circle-question"></i> 按钮功能说明
                </h4>
                <ul style={{ 
                  margin: 0, 
                  paddingLeft: '20px',
                  color: '#78350f',
                  lineHeight: '1.8',
                  listStyle: 'none',
                }}>
                  <li>🟢 <strong>初始化仓库</strong>：创建新的 Git 仓库</li>
                  <li>🟣 <strong>一键上传</strong>：自动完成 提交 + 推送</li>
                  <li>🟠 <strong>一键拉取</strong>：从远程获取并合并代码</li>
                  <li>🔵 <strong>一键获取</strong>：仅获取远程更新，不合并</li>
                  <li>🟣 <strong>提交更改</strong>：仅提交到本地仓库</li>
                  <li>🔴 <strong>克隆仓库</strong>：从 GitHub 复制仓库到本地</li>
                </ul>
              </div>
              
              {/* 注意事项 */}
              <div style={{
                background: 'white',
                padding: '15px',
                borderRadius: '8px',
                border: '1px solid #fcd34d',
              }}>
                <h4 style={{ 
                  margin: '0 0 10px 0', 
                  fontSize: '16px', 
                  fontWeight: 'bold',
                  color: '#dc2626',
                }}>
                  <i className="fa-solid fa-triangle-exclamation"></i> 重要注意事项
                </h4>
                <ul style={{ 
                  margin: 0, 
                  paddingLeft: '20px',
                  color: '#991b1b',
                  lineHeight: '1.8',
                }}>
                  <li><strong>⚠️ 先拉取再推送</strong>：推送前务必先拉取最新代码，避免冲突</li>
                  <li><strong>⚠️ 不要在 GitHub 上直接修改</strong>：这会导致本地和远程不同步</li>
                  <li><strong>⚠️ 等待操作完成</strong>：看到成功提示后再进行下一个操作</li>
                  <li><strong>⚠️ 关闭其他 Git 工具</strong>：避免文件锁定错误</li>
                </ul>
              </div>
              
              {/* 常见问题 */}
              <div style={{
                background: 'white',
                padding: '15px',
                borderRadius: '8px',
                border: '1px solid #fcd34d',
              }}>
                <h4 style={{ 
                  margin: '0 0 10px 0', 
                  fontSize: '16px', 
                  fontWeight: 'bold',
                  color: '#166534',
                }}>
                  <i className="fa-solid fa-lightbulb"></i> 常见问题解决
                </h4>
                <ul style={{ 
                  margin: 0, 
                  paddingLeft: '20px',
                  color: '#166534',
                  lineHeight: '1.8',
                  listStyle: 'none',
                }}>
                  <li>❌ <strong>推送失败</strong> → 先点击"一键拉取"合并远程更改</li>
                  <li>❌ <strong>文件锁定错误</strong> → 关闭其他 Git 进程，删除 .git/index.lock</li>
                  <li>❌ <strong>权限错误</strong> → 关闭文件资源管理器中的 .git 文件夹</li>
                  <li>❌ <strong>没有远程仓库</strong> → 填写 GitHub URL 后初始化仓库</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Toast 通知 */}
      <div style={{
        position: 'fixed',
        bottom: '20px',
        right: '20px',
        zIndex: 1000,
      }}>
        {toasts.map(toast => (
          <div
            key={toast.id}
            style={{
              padding: '16px 24px',
              marginBottom: '10px',
              background: toast.type === 'success' ? '#10b981' : toast.type === 'error' ? '#ef4444' : '#3b82f6',
              color: 'white',
              borderRadius: '8px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
              animation: 'slideIn 0.3s ease-out',
            }}
          >
            {toast.message}
          </div>
        ))}
      </div>

      {/* 加载遮罩 */}
      {isLoading && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.5)',
          backdropFilter: 'blur(4px)',
          zIndex: 1001,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <div style={{
            background: 'white',
            padding: '32px',
            borderRadius: '16px',
            textAlign: 'center',
            boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
          }}>
            <div style={{
              width: '48px',
              height: '48px',
              border: '4px solid #e5e7eb',
              borderTopColor: '#667eea',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
              margin: '0 auto 16px',
            }}></div>
            <div style={{ fontWeight: '600', color: '#374151' }}>{currentOperation}</div>
          </div>
        </div>
      )}

      {/* 提交对话框 */}
      {showCommitDialog && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.5)',
          backdropFilter: 'blur(4px)',
          zIndex: 1001,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <div style={{
            background: 'white',
            padding: '32px',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '500px',
            boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
          }}>
            <h3 style={{ margin: '0 0 24px 0', fontSize: '20px', fontWeight: 'bold', textAlign: 'center' }}>
              {pendingPush ? '提交并推送更改' : '提交更改'}
            </h3>
            
            <div style={{ marginBottom: '24px' }}>
              <label style={{
                display: 'block',
                marginBottom: '8px',
                fontWeight: '600',
                color: '#374151',
              }}>
                <i className="fa-solid fa-pen"></i> 提交信息 ({commitMessage.length}/200)
              </label>
              <textarea
                value={commitMessage}
                onChange={(e) => setCommitMessage(e.target.value.slice(0, 200))}
                placeholder="请输入提交信息，例如：修复登录页面样式问题"
                style={{
                  width: '100%',
                  padding: '12px',
                  border: '2px solid #e5e7eb',
                  borderRadius: '8px',
                  fontSize: '14px',
                  resize: 'vertical',
                  minHeight: '120px',
                  fontFamily: 'inherit',
                  boxSizing: 'border-box',
                  outline: 'none',
                }}
                autoFocus
              />
            </div>
            
            <div style={{ display: 'flex', justifyContent: 'end', gap: '12px' }}>
              <button
                onClick={handleCommitCancel}
                style={{
                  padding: '12px 24px',
                  background: '#ef4444',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontWeight: '600',
                  cursor: 'pointer',
                }}
              >
                取消
              </button>
              <button
                onClick={handleCommitConfirm}
                disabled={!commitMessage.trim()}
                style={{
                  padding: '12px 24px',
                  background: commitMessage.trim() ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' : '#d1d5db',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontWeight: '600',
                  cursor: commitMessage.trim() ? 'pointer' : 'not-allowed',
                }}
              >
                {pendingPush ? '提交并推送' : '提交'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 动画样式 */}
      <style>{`
        @keyframes slideIn {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
        
        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </div>
  )
}

export default App
