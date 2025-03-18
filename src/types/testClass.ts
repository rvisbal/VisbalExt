export interface TestClass {
    name: string;
    id: string;
    methods: string[];
    symbolTable?: any;
    attributes: {
        fileName: string;
        fullName: string;
    };
} 