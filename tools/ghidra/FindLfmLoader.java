// Ghidra headless script: найти функции, ссылающиеся на строки .lfm / Data-путей,
// и выгрузить их декомпилированный C-код для анализа алгоритма расшифровки каталогов.
//@category Analysis

import ghidra.app.script.GhidraScript;
import ghidra.app.decompiler.DecompileResults;
import ghidra.app.decompiler.DecompInterface;
import ghidra.program.model.address.Address;
import ghidra.program.model.listing.Function;
import ghidra.program.model.mem.Memory;
import ghidra.program.model.symbol.Reference;

import java.io.File;
import java.io.PrintWriter;
import java.io.FileWriter;
import java.util.LinkedHashSet;
import java.util.Set;

public class FindLfmLoader extends GhidraScript {

    private static final String OUT = "C:\\Meine\\tools\\lfm_analysis.c";

    public void run() throws Exception {
        String[] needles = {
            ".lfm", "data/lua", "Data/Maps", "characters.ini",
            "locale", "Lfm", "LFM",
        };
        Memory mem = currentProgram.getMemory();
        Set<Function> funcs = new LinkedHashSet<>();
        Address start = currentProgram.getMinAddress();

        for (String needle : needles) {
            byte[] pat = needle.getBytes("ASCII");
            Address addr = start;
            int hits = 0;
            while (hits < 200) {
                addr = mem.findBytes(addr, pat, null, true, monitor);
                if (addr == null) {
                    break;
                }
                hits++;
                println("string \"" + needle + "\" @ " + addr);
                Reference[] refs = getReferencesTo(addr);
                if (refs.length == 0) {
                    println("  (нет прямых ссылок)");
                }
                for (Reference r : refs) {
                    Function f = getFunctionContaining(r.getFromAddress());
                    if (f != null) {
                        funcs.add(f);
                        println("  <- " + r.getFromAddress() + " в " + f.getName() + " @ " + f.getEntryPoint());
                    } else {
                        println("  <- " + r.getFromAddress() + " (вне функций)");
                    }
                }
                addr = addr.add(1);
            }
        }

        DecompInterface di = new DecompInterface();
        di.openProgram(currentProgram);
        PrintWriter out = new PrintWriter(new FileWriter(OUT));
        for (Function f : funcs) {
            DecompileResults res = di.decompileFunction(f, 120, monitor);
            out.println("// ==== " + f.getName() + " @ " + f.getEntryPoint() + " ====");
            if (res.decompileCompleted()) {
                out.println(res.getDecompiledFunction().getC());
            } else {
                out.println("// декомпиляция не удалась: " + res.getErrorMessage());
            }
            out.println();
        }
        out.close();
        di.dispose();
        println("DONE: функций " + funcs.size() + ", вывод в " + OUT);
    }
}
