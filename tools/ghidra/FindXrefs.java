// Ghidra headless: для каждого адреса-аргумента вывести все ссылки НА него
// и декомпилировать функции, содержащие ссылающиеся адреса.
//@category Analysis

import ghidra.app.script.GhidraScript;
import ghidra.app.decompiler.DecompInterface;
import ghidra.app.decompiler.DecompileResults;
import ghidra.program.model.address.Address;
import ghidra.program.model.listing.Function;
import ghidra.program.model.symbol.Reference;

import java.io.PrintWriter;
import java.io.FileWriter;
import java.util.LinkedHashSet;
import java.util.Set;

public class FindXrefs extends GhidraScript {

    private static final String OUT = "C:\\Meine\\tools\\xrefs.c";

    public void run() throws Exception {
        String[] args = getScriptArgs();
        DecompInterface di = new DecompInterface();
        di.openProgram(currentProgram);
        PrintWriter out = new PrintWriter(new FileWriter(OUT));
        for (String arg : args) {
            long raw = Long.parseLong(arg.replace("0x", "").replace("0X", ""), 16);
            Address a = currentProgram.getAddressFactory().getDefaultAddressSpace().getAddress(raw);
            out.println("// #### ССЫЛКИ НА " + arg + " ####");
            Set<Function> funcs = new LinkedHashSet<>();
            for (Reference r : getReferencesTo(a)) {
                Function f = getFunctionContaining(r.getFromAddress());
                String fname = f == null ? "(нет функции)" : f.getName() + " @ " + f.getEntryPoint();
                out.println("//   " + r.getReferenceType() + " от " + r.getFromAddress() + " в " + fname);
                if (f != null) {
                    funcs.add(f);
                }
            }
            out.println();
            for (Function f : funcs) {
                DecompileResults res = di.decompileFunction(f, 180, monitor);
                out.println("// ==== " + f.getName() + " @ " + f.getEntryPoint() + " (ссылается на " + arg + ") ====");
                if (res.decompileCompleted()) {
                    out.println(res.getDecompiledFunction().getC());
                } else {
                    out.println("// ошибка: " + res.getErrorMessage());
                }
                out.println();
                println("ok " + f.getName());
            }
        }
        out.close();
        di.dispose();
        println("DONE");
    }
}
