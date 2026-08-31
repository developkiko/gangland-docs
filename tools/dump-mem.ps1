# Дамп приватной памяти процесса GangLand (MEM_COMMIT + MEM_PRIVATE) в файлы.
param(
    [string]$OutDir = "C:\Meine\tools\memdump"
)
$ErrorActionPreference = "Stop"
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

$src = @"
using System;
using System.Runtime.InteropServices;

public class MemDump {
    [DllImport("kernel32.dll", SetLastError=true)]
    public static extern IntPtr OpenProcess(uint access, bool inherit, int pid);
    [DllImport("kernel32.dll", SetLastError=true)]
    public static extern bool CloseHandle(IntPtr h);
    [DllImport("kernel32.dll", SetLastError=true)]
    public static extern int ReadProcessMemory(IntPtr h, IntPtr addr, byte[] buf, int size, out int read);
    [DllImport("kernel32.dll", SetLastError=true)]
    public static extern int VirtualQueryEx(IntPtr h, IntPtr addr, out MEMORY_BASIC_INFORMATION info, int len);

    [StructLayout(LayoutKind.Sequential)]
    public struct MEMORY_BASIC_INFORMATION {
        public IntPtr BaseAddress;
        public IntPtr AllocationBase;
        public uint AllocationProtect;
        public IntPtr RegionSize;
        public uint State;
        public uint Protect;
        public uint Type;
    }
}
"@
Add-Type -TypeDefinition $src

$proc = Get-Process GangLand -ErrorAction Stop
$procId = $proc.Id
Write-Host "PID: $procId, working set: $([math]::Round($proc.WorkingSet64/1MB)) MB"

# PROCESS_QUERY_INFORMATION | PROCESS_VM_READ
$h = [MemDump]::OpenProcess(0x0410, $false, $procId)
if ($h -eq [IntPtr]::Zero) { throw "OpenProcess failed: $([Runtime.InteropServices.Marshal]::GetLastWin32Error())" }

$addr = [Int64]0x10000
$maxAddr = [Int64]0x7FFF0000
$idx = 0
$total = 0
$mbiSize = [Runtime.InteropServices.Marshal]::SizeOf([type][MemDump+MEMORY_BASIC_INFORMATION])

while ($addr -lt $maxAddr) {
    $mbi = New-Object MemDump+MEMORY_BASIC_INFORMATION
    $r = [MemDump]::VirtualQueryEx($h, [IntPtr]$addr, [ref]$mbi, $mbiSize)
    if ($r -eq 0) { break }
    $base = [Int64]$mbi.BaseAddress.ToInt64()
    $size = [Int64]$mbi.RegionSize.ToInt64()
    if ($size -le 0) { break }
    # MEM_COMMIT=0x1000, любой тип, кроме PAGE_NOACCESS
    if ($mbi.State -eq 0x1000 -and $mbi.Protect -ne 0x01 -and $size -lt 200MB) {
        $buf = New-Object byte[] $size
        $read = 0
        $ok = [MemDump]::ReadProcessMemory($h, [IntPtr]$base, $buf, [int]$size, [ref]$read)
        if ($ok -and $read -gt 0) {
            $file = Join-Path $OutDir ("region_{0:x8}_{1}.bin" -f $base, $read)
            [IO.File]::WriteAllBytes($file, $buf[0..($read-1)])
            $total += $read
            $idx++
        }
    }
    $addr = $base + $size
}
[MemDump]::CloseHandle($h) | Out-Null
Write-Host "regions: $idx, bytes: $total"
