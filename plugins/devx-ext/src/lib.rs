extern crate duckdb;
extern crate duckdb_loadable_macros;
extern crate libduckdb_sys;

mod git;
mod process_manager;
mod subprocess;
mod validation;

use duckdb::{
    core::{DataChunkHandle, Inserter, LogicalTypeHandle, LogicalTypeId},
    vtab::{BindInfo, InitInfo, TableFunctionInfo, VTab},
    Connection, Result,
};
use duckdb_loadable_macros::duckdb_entrypoint_c_api;
use libduckdb_sys as _ffi;
use std::{
    error::Error,
    ffi::CString,
    sync::atomic::{AtomicBool, Ordering},
};

// ---------------------------------------------------------------------------
// Macro to reduce boilerplate for single-param VTab functions
// ---------------------------------------------------------------------------

macro_rules! define_vtab_1param {
    ($vtab:ident, $bind:ident, $init:ident, $func_impl:expr) => {
        #[repr(C)]
        struct $bind {
            p0: String,
        }

        #[repr(C)]
        struct $init {
            done: AtomicBool,
            result: String,
        }

        struct $vtab;

        impl VTab for $vtab {
            type InitData = $init;
            type BindData = $bind;

            fn bind(bind: &BindInfo) -> Result<Self::BindData, Box<dyn Error>> {
                bind.add_result_column(
                    "column0",
                    LogicalTypeHandle::from(LogicalTypeId::Varchar),
                );
                let p0 = bind.get_parameter(0).to_string();
                Ok($bind { p0 })
            }

            fn init(init: &InitInfo) -> Result<Self::InitData, Box<dyn Error>> {
                let bind_data = init.get_bind_data::<Self::BindData>();
                let p0 = unsafe { (*bind_data).p0.clone() };
                let func: fn(&str) -> Result<String, Box<dyn Error>> = $func_impl;
                let result = func(&p0)?;
                Ok($init {
                    done: AtomicBool::new(false),
                    result,
                })
            }

            fn func(
                func: &TableFunctionInfo<Self>,
                output: &mut DataChunkHandle,
            ) -> Result<(), Box<dyn Error>> {
                let init_data = func.get_init_data();
                if init_data.done.swap(true, Ordering::Relaxed) {
                    output.set_len(0);
                } else {
                    let vector = output.flat_vector(0);
                    vector.insert(0, CString::new(init_data.result.clone())?);
                    output.set_len(1);
                }
                Ok(())
            }

            fn parameters() -> Option<Vec<LogicalTypeHandle>> {
                Some(vec![LogicalTypeHandle::from(LogicalTypeId::Varchar)])
            }
        }
    };
}

macro_rules! define_vtab_2param {
    ($vtab:ident, $bind:ident, $init:ident, $func_impl:expr) => {
        #[repr(C)]
        struct $bind {
            p0: String,
            p1: String,
        }

        #[repr(C)]
        struct $init {
            done: AtomicBool,
            result: String,
        }

        struct $vtab;

        impl VTab for $vtab {
            type InitData = $init;
            type BindData = $bind;

            fn bind(bind: &BindInfo) -> Result<Self::BindData, Box<dyn Error>> {
                bind.add_result_column(
                    "column0",
                    LogicalTypeHandle::from(LogicalTypeId::Varchar),
                );
                let p0 = bind.get_parameter(0).to_string();
                let p1 = bind.get_parameter(1).to_string();
                Ok($bind { p0, p1 })
            }

            fn init(init: &InitInfo) -> Result<Self::InitData, Box<dyn Error>> {
                let bind_data = init.get_bind_data::<Self::BindData>();
                let (p0, p1) = unsafe { ((*bind_data).p0.clone(), (*bind_data).p1.clone()) };
                let func: fn(&str, &str) -> Result<String, Box<dyn Error>> = $func_impl;
                let result = func(&p0, &p1)?;
                Ok($init {
                    done: AtomicBool::new(false),
                    result,
                })
            }

            fn func(
                func: &TableFunctionInfo<Self>,
                output: &mut DataChunkHandle,
            ) -> Result<(), Box<dyn Error>> {
                let init_data = func.get_init_data();
                if init_data.done.swap(true, Ordering::Relaxed) {
                    output.set_len(0);
                } else {
                    let vector = output.flat_vector(0);
                    vector.insert(0, CString::new(init_data.result.clone())?);
                    output.set_len(1);
                }
                Ok(())
            }

            fn parameters() -> Option<Vec<LogicalTypeHandle>> {
                Some(vec![
                    LogicalTypeHandle::from(LogicalTypeId::Varchar),
                    LogicalTypeHandle::from(LogicalTypeId::Varchar),
                ])
            }
        }
    };
}

macro_rules! define_vtab_3param {
    ($vtab:ident, $bind:ident, $init:ident, $func_impl:expr) => {
        #[repr(C)]
        struct $bind {
            p0: String,
            p1: String,
            p2: String,
        }

        #[repr(C)]
        struct $init {
            done: AtomicBool,
            result: String,
        }

        struct $vtab;

        impl VTab for $vtab {
            type InitData = $init;
            type BindData = $bind;

            fn bind(bind: &BindInfo) -> Result<Self::BindData, Box<dyn Error>> {
                bind.add_result_column(
                    "column0",
                    LogicalTypeHandle::from(LogicalTypeId::Varchar),
                );
                let p0 = bind.get_parameter(0).to_string();
                let p1 = bind.get_parameter(1).to_string();
                let p2 = bind.get_parameter(2).to_string();
                Ok($bind { p0, p1, p2 })
            }

            fn init(init: &InitInfo) -> Result<Self::InitData, Box<dyn Error>> {
                let bind_data = init.get_bind_data::<Self::BindData>();
                let (p0, p1, p2) = unsafe {
                    (
                        (*bind_data).p0.clone(),
                        (*bind_data).p1.clone(),
                        (*bind_data).p2.clone(),
                    )
                };
                let func: fn(&str, &str, &str) -> Result<String, Box<dyn Error>> = $func_impl;
                let result = func(&p0, &p1, &p2)?;
                Ok($init {
                    done: AtomicBool::new(false),
                    result,
                })
            }

            fn func(
                func: &TableFunctionInfo<Self>,
                output: &mut DataChunkHandle,
            ) -> Result<(), Box<dyn Error>> {
                let init_data = func.get_init_data();
                if init_data.done.swap(true, Ordering::Relaxed) {
                    output.set_len(0);
                } else {
                    let vector = output.flat_vector(0);
                    vector.insert(0, CString::new(init_data.result.clone())?);
                    output.set_len(1);
                }
                Ok(())
            }

            fn parameters() -> Option<Vec<LogicalTypeHandle>> {
                Some(vec![
                    LogicalTypeHandle::from(LogicalTypeId::Varchar),
                    LogicalTypeHandle::from(LogicalTypeId::Varchar),
                    LogicalTypeHandle::from(LogicalTypeId::Varchar),
                ])
            }
        }
    };
}

// ---------------------------------------------------------------------------
// Git VTabs (12)
// ---------------------------------------------------------------------------

define_vtab_1param!(DevxGitInitVTab, GitInitBind, GitInitInit, git::git_init);
define_vtab_1param!(DevxGitStatusVTab, GitStatusBind, GitStatusInit, git::git_status);
define_vtab_2param!(DevxGitCommitVTab, GitCommitBind, GitCommitInit, git::git_commit);
define_vtab_2param!(DevxGitLogVTab, GitLogBind, GitLogInit, git::git_log);
define_vtab_1param!(DevxGitDiffVTab, GitDiffBind, GitDiffInit, git::git_diff);
define_vtab_1param!(DevxGitBranchListVTab, GitBranchListBind, GitBranchListInit, git::git_branch_list);
define_vtab_2param!(DevxGitBranchCreateVTab, GitBranchCreateBind, GitBranchCreateInit, git::git_branch_create);
define_vtab_2param!(DevxGitBranchSwitchVTab, GitBranchSwitchBind, GitBranchSwitchInit, git::git_branch_switch);
define_vtab_2param!(DevxGitRevertVTab, GitRevertBind, GitRevertInit, git::git_revert);
define_vtab_2param!(DevxGitPushVTab, GitPushBind, GitPushInit, git::git_push);
define_vtab_2param!(DevxGitPullVTab, GitPullBind, GitPullInit, git::git_pull);
define_vtab_2param!(DevxGitSetRemoteVTab, GitSetRemoteBind, GitSetRemoteInit, git::git_set_remote);

// ---------------------------------------------------------------------------
// NPM Install VTab
// ---------------------------------------------------------------------------

fn npm_install_impl(path: &str, packages_json: &str, dev: &str) -> Result<String, Box<dyn Error>> {
    validation::validate_workspace_path(path)?;
    let packages: Vec<String> = serde_json::from_str(packages_json)
        .map_err(|e| format!("Invalid packages JSON: {e}"))?;
    if packages.is_empty() {
        return Err("No packages specified".into());
    }
    let mut args: Vec<&str> = vec!["install"];
    if dev == "true" {
        args.push("--save-dev");
    }
    let pkg_refs: Vec<&str> = packages.iter().map(|s| s.as_str()).collect();
    args.extend(&pkg_refs);
    let (ok, _code, stdout, stderr) = subprocess::run_command("npm", &args, path)?;
    if !ok {
        let msg = if stderr.is_empty() { &stdout } else { &stderr };
        return Err(format!("npm install failed: {msg}").into());
    }
    Ok(serde_json::json!({"ok": true, "message": stdout.trim()}).to_string())
}

define_vtab_3param!(DevxNpmInstallVTab, NpmInstallBind, NpmInstallInit, npm_install_impl);

// ---------------------------------------------------------------------------
// TSC Check VTab
// ---------------------------------------------------------------------------

fn tsc_check_impl(path: &str) -> Result<String, Box<dyn Error>> {
    validation::validate_workspace_path(path)?;
    let (ok, _code, stdout, stderr) = subprocess::run_command("npx", &["tsc", "--noEmit", "--pretty", "false"], path)?;
    if ok {
        Ok(serde_json::json!({"ok": true, "message": "No type errors found."}).to_string())
    } else {
        let output = if stdout.is_empty() { stderr } else { stdout };
        Ok(serde_json::json!({"ok": false, "message": output}).to_string())
    }
}

define_vtab_1param!(DevxTscCheckVTab, TscCheckBind, TscCheckInit, tsc_check_impl);

// ---------------------------------------------------------------------------
// Run Command VTab
// ---------------------------------------------------------------------------

fn run_command_impl(path: &str, command: &str) -> Result<String, Box<dyn Error>> {
    validation::validate_workspace_path(path)?;
    let (cmd, args) = validation::validate_command(command)?;
    let arg_refs: Vec<&str> = args.iter().copied().collect();
    let (ok, code, stdout, stderr) = subprocess::run_command(cmd, &arg_refs, path)?;
    let output = if stdout.is_empty() { stderr.trim().to_string() } else { stdout.trim().to_string() };
    Ok(serde_json::json!({"ok": ok, "exit_code": code, "output": output}).to_string())
}

define_vtab_2param!(DevxRunCommandVTab, RunCommandBind, RunCommandInit, run_command_impl);

// ---------------------------------------------------------------------------
// Process Manager VTabs
// ---------------------------------------------------------------------------

define_vtab_2param!(DevxProcessStartVTab, ProcessStartBind, ProcessStartInit, process_manager::process_start);
define_vtab_2param!(DevxProcessStopVTab, ProcessStopBind, ProcessStopInit, process_manager::process_stop);
define_vtab_2param!(DevxProcessStatusVTab, ProcessStatusBind, ProcessStatusInit, process_manager::process_status);
define_vtab_2param!(DevxProcessOutputVTab, ProcessOutputBind, ProcessOutputInit, process_manager::process_output);
define_vtab_2param!(DevxProcessInputVTab, ProcessInputBind, ProcessInputInit, process_manager::process_input);

// ---------------------------------------------------------------------------
// Extension entrypoint
// ---------------------------------------------------------------------------

#[duckdb_entrypoint_c_api()]
pub unsafe fn extension_entrypoint(con: Connection) -> Result<(), Box<dyn Error>> {
    con.register_table_function::<DevxGitInitVTab>("trex_devx_git_init")?;
    con.register_table_function::<DevxGitStatusVTab>("trex_devx_git_status")?;
    con.register_table_function::<DevxGitCommitVTab>("trex_devx_git_commit")?;
    con.register_table_function::<DevxGitLogVTab>("trex_devx_git_log")?;
    con.register_table_function::<DevxGitDiffVTab>("trex_devx_git_diff")?;
    con.register_table_function::<DevxGitBranchListVTab>("trex_devx_git_branch_list")?;
    con.register_table_function::<DevxGitBranchCreateVTab>("trex_devx_git_branch_create")?;
    con.register_table_function::<DevxGitBranchSwitchVTab>("trex_devx_git_branch_switch")?;
    con.register_table_function::<DevxGitRevertVTab>("trex_devx_git_revert")?;
    con.register_table_function::<DevxGitPushVTab>("trex_devx_git_push")?;
    con.register_table_function::<DevxGitPullVTab>("trex_devx_git_pull")?;
    con.register_table_function::<DevxGitSetRemoteVTab>("trex_devx_git_set_remote")?;
    con.register_table_function::<DevxNpmInstallVTab>("trex_devx_npm_install")?;
    con.register_table_function::<DevxTscCheckVTab>("trex_devx_tsc_check")?;
    con.register_table_function::<DevxRunCommandVTab>("trex_devx_run_command")?;
    con.register_table_function::<DevxProcessStartVTab>("trex_devx_process_start")?;
    con.register_table_function::<DevxProcessStopVTab>("trex_devx_process_stop")?;
    con.register_table_function::<DevxProcessStatusVTab>("trex_devx_process_status")?;
    con.register_table_function::<DevxProcessOutputVTab>("trex_devx_process_output")?;
    con.register_table_function::<DevxProcessInputVTab>("trex_devx_process_input")?;
    Ok(())
}
