import { simpleGit, StatusResult, LogResult, BranchSummary } from 'simple-git'

export interface GitStatus {
  current: string | null
  tracking: string | null
  staged: string[]
  modified: string[]
  deleted: string[]
  untracked: string[]
  conflicted: string[]
  ahead: number
  behind: number
}

export interface GitCommit {
  hash: string
  date: string
  message: string
  author_name: string
  author_email: string
  refs: string
}

export interface GitBranch {
  name: string
  current: boolean
  commit: string
  label: string
}

export interface GitBranches {
  local: GitBranch[]
  remote: GitBranch[]
}

export class GitService {
  // 检查路径是否是Git仓库
  async isRepo(path: string): Promise<boolean> {
    try {
      const git = simpleGit(path)
      await git.status()
      return true
    } catch {
      return false
    }
  }

  // 初始化仓库
  async init(path: string): Promise<{ success: boolean; error?: string }> {
    try {
      const git = simpleGit(path)
      await git.init()
      return { success: true }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  }

  // 打开仓库（验证）
  async open(path: string): Promise<{ success: boolean; error?: string }> {
    try {
      const isRepository = await this.isRepo(path)
      if (!isRepository) {
        return { success: false, error: 'Not a git repository' }
      }
      return { success: true }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  }

  // 克隆仓库
  async clone(url: string, path: string): Promise<{ success: boolean; error?: string }> {
    try {
      await simpleGit().clone(url, path)
      return { success: true }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  }

  // 获取状态
  async status(path: string): Promise<{ success: boolean; status?: GitStatus; error?: string }> {
    try {
      const git = simpleGit(path)
      const statusResult: StatusResult = await git.status()
      const status: GitStatus = {
        current: statusResult.current,
        tracking: statusResult.tracking,
        staged: statusResult.staged,
        modified: statusResult.modified,
        deleted: statusResult.deleted,
        untracked: statusResult.not_added,
        conflicted: statusResult.conflicted,
        ahead: statusResult.ahead,
        behind: statusResult.behind
      }
      return { success: true, status }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  }

  // 获取当前分支
  async currentBranch(path: string): Promise<{ success: boolean; branch?: string; error?: string }> {
    try {
      const git = simpleGit(path)
      const branch: BranchSummary = await git.branch()
      return { success: true, branch: branch.current }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  }

  // 获取分支列表
  async branches(path: string): Promise<{ success: boolean; branches?: GitBranches; error?: string }> {
    try {
      const git = simpleGit(path)
      const branch: BranchSummary = await git.branch(['-a'])
      const local: GitBranch[] = []
      const remote: GitBranch[] = []

      for (const [name, info] of Object.entries(branch.branches)) {
        if (name.startsWith('remotes/')) {
          remote.push({
            name: name.replace('remotes/', ''),
            current: info.current,
            commit: info.commit,
            label: info.label
          })
        } else {
          local.push({
            name: name,
            current: info.current,
            commit: info.commit,
            label: info.label
          })
        }
      }

      return { success: true, branches: { local, remote } }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  }

  // 创建分支
  async createBranch(path: string, name: string): Promise<{ success: boolean; error?: string }> {
    try {
      const git = simpleGit(path)
      await git.branch([name])
      return { success: true }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  }

  // 删除分支
  async deleteBranch(path: string, name: string, force: boolean = false): Promise<{ success: boolean; error?: string }> {
    try {
      const git = simpleGit(path)
      await git.deleteLocalBranches([name], force)
      return { success: true }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  }

  // 切换分支
  async checkout(path: string, branch: string): Promise<{ success: boolean; error?: string }> {
    try {
      const git = simpleGit(path)
      await git.checkout(branch)
      return { success: true }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  }

  // 合并分支
  async merge(path: string, branch: string): Promise<{ success: boolean; error?: string }> {
    try {
      const git = simpleGit(path)
      await git.merge([branch])
      return { success: true }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  }

  // 暂存文件
  async add(path: string, files: string[]): Promise<{ success: boolean; error?: string }> {
    try {
      const git = simpleGit(path)
      
      // 重试机制处理锁文件问题
      let retries = 3
      let lastError: any
      
      while (retries > 0) {
        try {
          await git.add(files)
          return { success: true }
        } catch (error: any) {
          lastError = error
          // 如果是锁文件错误，等待后重试
          if (error.message && (error.message.includes('index.lock') || error.message.includes('Unable to create'))) {
            retries--
            if (retries > 0) {
              // 等待 500ms 后重试
              await new Promise(resolve => setTimeout(resolve, 500))
              continue
            }
          } else {
            // 其他错误直接抛出
            throw error
          }
        }
      }
      
      // 所有重试都失败
      const errorMsg = String(lastError)
      if (errorMsg.includes('index.lock')) {
        return { 
          success: false, 
          error: 'Git 锁文件错误。请关闭其他 Git 进程，或删除 .git/index.lock 文件后重试。' 
        }
      }
      return { success: false, error: errorMsg }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  }

  // 取消暂存
  async reset(path: string, files: string[]): Promise<{ success: boolean; error?: string }> {
    try {
      const git = simpleGit(path)
      await git.reset(['HEAD', '--', ...files])
      return { success: true }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  }

  // 提交
  async commit(path: string, message: string): Promise<{ success: boolean; error?: string }> {
    try {
      const git = simpleGit(path)
      
      // 重试机制处理锁文件问题
      let retries = 3
      let lastError: any
      
      while (retries > 0) {
        try {
          await git.commit(message)
          return { success: true }
        } catch (error: any) {
          lastError = error
          if (error.message && (error.message.includes('index.lock') || error.message.includes('Unable to create'))) {
            retries--
            if (retries > 0) {
              await new Promise(resolve => setTimeout(resolve, 500))
              continue
            }
          } else {
            throw error
          }
        }
      }
      
      const errorMsg = String(lastError)
      if (errorMsg.includes('index.lock')) {
        return { 
          success: false, 
          error: 'Git 锁文件错误。请关闭其他 Git 进程，或删除 .git/index.lock 文件后重试。' 
        }
      }
      return { success: false, error: errorMsg }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  }

  // 添加远程仓库
  async addRemote(path: string, name: string, url: string): Promise<{ success: boolean; error?: string }> {
    try {
      const git = simpleGit(path)
      await git.addRemote(name, url)
      return { success: true }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  }

  // 获取远程仓库列表
  async getRemotes(path: string): Promise<{ success: boolean; remotes?: string[]; error?: string }> {
    try {
      const git = simpleGit(path)
      const remotes = await git.getRemotes(true)
      const remoteNames = remotes.map(remote => remote.name)
      return { success: true, remotes: remoteNames }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  }

  // 推送
  async push(path: string, remote?: string, branch?: string): Promise<{ success: boolean; error?: string }> {
    try {
      const git = simpleGit(path)
      
      // 如果没有指定远程仓库，尝试获取默认远程仓库
      if (!remote) {
        const remotes = await git.getRemotes(true)
        if (remotes.length === 0) {
          return { success: false, error: '未配置推送目标。请先添加远程仓库。' }
        }
        // 默认使用第一个远程仓库
        remote = remotes[0].name
      }
      
      // 如果没有指定分支，获取当前分支
      if (!branch) {
        const branchSummary = await git.branch()
        branch = branchSummary.current
      }
      
      // 首次推送需要设置上游分支
      const args = ['--set-upstream', remote, branch]
      await git.push(args)
      return { success: true }
    } catch (error) {
      const errorStr = String(error)
      // 检查是否是未配置远程仓库的错误
      if (errorStr.includes('No configured push destination') || errorStr.includes('未配置推送目标')) {
        return { success: false, error: '未配置远程仓库。请在应用界面设置GitHub仓库URL，或使用命令: git remote add origin <仓库URL>' }
      }
      // 检查其他常见错误
      if (errorStr.includes('fatal:')) {
        // 提取更友好的错误信息
        const match = errorStr.match(/fatal: (.+)/)
        if (match) {
          return { success: false, error: `Git错误: ${match[1]}` }
        }
      }
      return { success: false, error: errorStr }
    }
  }

  // 拉取
  async pull(path: string): Promise<{ success: boolean; error?: string }> {
    try {
      const git = simpleGit(path)
      
      // 重试机制处理文件锁定问题
      let retries = 3
      let lastError: any
      
      while (retries > 0) {
        try {
          // 首先尝试获取当前分支信息
          const branchSummary = await git.branch()
          const currentBranch = branchSummary.current
          
          if (currentBranch) {
            // 尝试拉取并设置上游分支
            await git.pull('origin', currentBranch, ['--set-upstream'])
          } else {
            // 如果没有当前分支，直接拉取
            await git.pull()
          }
          
          return { success: true }
        } catch (error: any) {
          lastError = error
          // 如果是文件锁定错误，等待后重试
          if (error.message && (error.message.includes('Permission denied') || error.message.includes('Unable to create'))) {
            retries--
            if (retries > 0) {
              await new Promise(resolve => setTimeout(resolve, 500))
              continue
            }
          } else if (error.message && error.message.includes('no tracking information')) {
            // 没有跟踪信息，尝试拉取所有远程分支
            try {
              await git.fetch('origin')
              const branchSummary = await git.branch()
              const currentBranch = branchSummary.current
              if (currentBranch) {
                // 设置上游分支并拉取
                await git.branch(['--set-upstream-to', `origin/${currentBranch}`, currentBranch])
                await git.pull()
                return { success: true }
              }
            } catch (innerError) {
              // 如果还是失败，返回友好提示
              return { 
                success: false, 
                error: '当前分支没有跟踪信息。请先使用 "git branch --set-upstream-to=origin/master" 设置跟踪分支，或重新克隆仓库。' 
              }
            }
          } else {
            throw error
          }
        }
      }
      
      const errorMsg = String(lastError)
      if (errorMsg.includes('Permission denied')) {
        return { 
          success: false, 
          error: 'Git 文件权限错误。请关闭其他 Git 进程，或手动删除 .git/FETCH_HEAD 文件后重试。' 
        }
      }
      return { success: false, error: errorMsg }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  }

  // 获取
  async fetch(path: string): Promise<{ success: boolean; error?: string }> {
    try {
      const git = simpleGit(path)
      
      // 重试机制处理文件锁定问题
      let retries = 3
      let lastError: any
      
      while (retries > 0) {
        try {
          await git.fetch()
          return { success: true }
        } catch (error: any) {
          lastError = error
          if (error.message && (error.message.includes('Permission denied') || error.message.includes('Unable to create'))) {
            retries--
            if (retries > 0) {
              await new Promise(resolve => setTimeout(resolve, 500))
              continue
            }
          } else {
            throw error
          }
        }
      }
      
      const errorMsg = String(lastError)
      if (errorMsg.includes('Permission denied')) {
        return { 
          success: false, 
          error: 'Git 文件权限错误。请关闭其他 Git 进程，或手动删除 .git 目录中的锁定文件后重试。' 
        }
      }
      return { success: false, error: errorMsg }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  }

  // 获取日志
  async log(path: string, maxCount: number = 50): Promise<{ success: boolean; commits?: GitCommit[]; error?: string }> {
    try {
      const git = simpleGit(path)
      const log: LogResult = await git.log({ maxCount })
      const commits: GitCommit[] = log.all.map(entry => ({
        hash: entry.hash,
        date: entry.date,
        message: entry.message,
        author_name: entry.author_name,
        author_email: entry.author_email,
        refs: entry.refs
      }))
      return { success: true, commits }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  }

  // 获取差异
  async diff(path: string, file?: string): Promise<{ success: boolean; diff?: string; error?: string }> {
    try {
      const git = simpleGit(path)
      let diff: string
      if (file) {
        diff = await git.diff([file])
      } else {
        diff = await git.diff()
      }
      return { success: true, diff }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  }

  // 获取暂存区差异
  async diffCached(path: string): Promise<{ success: boolean; diff?: string; error?: string }> {
    try {
      const git = simpleGit(path)
      const diff = await git.diff(['--cached'])
      return { success: true, diff }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  }

  // 撤销文件修改
  async checkoutFile(path: string, file: string): Promise<{ success: boolean; error?: string }> {
    try {
      const git = simpleGit(path)
      await git.checkout(['--', file])
      return { success: true }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  }
}

export const gitService = new GitService()