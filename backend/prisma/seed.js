"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const bcrypt = __importStar(require("bcrypt"));
const prisma = new client_1.PrismaClient();
async function main() {
    for (const role of ['HOD', 'DESIGNER']) {
        await prisma.role.upsert({
            where: { name: role },
            update: {},
            create: { name: role },
        });
    }
    const hodRole = await prisma.role.findUnique({ where: { name: 'HOD' } });
    const designerRole = await prisma.role.findUnique({ where: { name: 'DESIGNER' } });
    if (!hodRole || !designerRole) {
        throw new Error('Required roles were not found after seeding roles');
    }
    const hodPasswordHash = await bcrypt.hash('Secret123!', 10);
    const designerPasswordHash = await bcrypt.hash('Secret123!', 10);
    await prisma.user.upsert({
        where: { email: 'hod@company.com' },
        update: {
            fullName: 'HOD User',
            roleId: hodRole.id,
            passwordHash: hodPasswordHash,
        },
        create: {
            email: 'hod@company.com',
            fullName: 'HOD User',
            roleId: hodRole.id,
            passwordHash: hodPasswordHash,
        },
    });
    await prisma.user.upsert({
        where: { email: 'designer@company.com' },
        update: {
            fullName: 'Designer User',
            roleId: designerRole.id,
            passwordHash: designerPasswordHash,
        },
        create: {
            email: 'designer@company.com',
            fullName: 'Designer User',
            roleId: designerRole.id,
            passwordHash: designerPasswordHash,
        },
    });
}
main()
    .then(async () => {
    await prisma.$disconnect();
})
    .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
});
//# sourceMappingURL=seed.js.map