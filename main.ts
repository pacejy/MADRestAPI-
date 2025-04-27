import products from "./products.json";
import categories from "./categories.json";
import express from "express";
import { z } from "zod";

const app = express();

const router = express.Router();

router.get("/products", (_req, res) => {
    res.status(200).json({ msg: "Success", data: products });
});

router.get("/products/category/:categoryId", (req, res) => {
    const categoryId = +req.params.categoryId;
    if (Number.isNaN(categoryId)) {
        res.status(400).json({ status: 400, msg: "Invalid category ID" });
        return;
    }

    res.status(200).json({
        msg: "Success",
        data: products.filter((product) => product.categoryId === categoryId),
    });
});

router.get("/categories", (_req, res) => {
    res.status(200).json({ msg: "Success", data: categories });
});

type CartItem = {
    id: number;
    product: (typeof products)[number];
    quantity: number;
};

type Order = {
    id: number;
    total: number;
    date: string;
    status: "Pending";
    cart: CartItem[];
};

class User {
    static ALL: User[] = [];

    constructor(
        public id: number,
        public email: string,
        public name: string,
        public password: string,
        public cart: CartItem[] = [],
        public cartId = 0,
        public orders: Order[] = []
    ) {}

    static create(email: string, name: string, password: string) {
        const user = new User(User.ALL.length + 1, email, name, password);
        User.ALL.push(user);
        return user;
    }

    static byEmail(email: string) {
        return this.ALL.find((user) => user.email === email);
    }

    static byId(id: number) {
        return this.ALL.find((user) => user.id === id);
    }

    cartTotal() {
        const subtotal = this.cart.reduce(
            (acc, item) => acc + item.product.price * item.quantity,
            0
        );
        const shipping = Math.round(subtotal * 0.1 * 100) / 100;
        const tax = Math.round(subtotal * 0.1 * 100) / 100;
        const total = Math.round((subtotal + shipping + tax) * 100) / 100;
        const discount = 0;
        return { subtotal, shipping, tax, total, discount };
    }

    cartJson() {
        return this.cart.map(({ product, quantity, id }) => ({
            id,
            productId: product.id,
            productName: product.title,
            price: product.price,
            imageUrl: product.image,
            quantity,
        }));
    }
}

const signupRequest = z.object({
    email: z.string().max(255),
    password: z.string().min(3).max(255),
    name: z.string().min(3).max(255),
});

const loginRequest = z.object({
    email: z.string().max(255),
    password: z.string().min(3).max(255),
});

const addtocartRequest = z.object({
    productId: z.number(),
    quantity: z.number().min(1),
});

const placeOrderRequest = z.object({
    addressLine: z.string().min(3).max(255),
    city: z.string().min(3).max(255),
    state: z.string().min(3).max(255),
    postalCode: z.string().min(3).max(255),
    country: z.string().min(3).max(255),
});

router.post("/signup", (req, res) => {
    const data = signupRequest.safeParse(req.body);
    if (data.error) {
        res.status(400).json({ status: 400, msg: "Invalid arguments" });
        return;
    }

    const { email, name, password } = data.data;
    if (User.byEmail(email)) {
        res.status(400).json({ status: 400, msg: "Email already registered" });
        return;
    }

    const user = User.create(email, name, password);
    res.status(201).json({
        msg: "Success",
        data: {
            id: user.id,
            email: user.email,
            name: user.name,
            username: user.email,
        },
    });
});

router.post("/login", (req, res) => {
    const data = loginRequest.safeParse(req.body);
    if (data.error) {
        res.status(400).json({ status: 400, msg: "Invalid arguments" });
        return;
    }

    const { email, password } = data.data;
    const user = User.byEmail(email);
    if (!user) {
        res.status(404).json({
            status: 404,
            msg: "No user with this email exists",
        });
        return;
    } else if (user.password !== password) {
        res.status(401).json({ status: 401, msg: "Password mismatch" });
        return;
    }

    res.status(201).json({
        msg: "Success",
        data: {
            id: user.id,
            email: user.email,
            name: user.name,
            username: user.email,
        },
    });
});

router.get("/checkout/:userId/summary", (req, res) => {
    const user = User.byId(+req.params.userId);
    if (!user) {
        res.status(404).json({
            status: 404,
            msg: "No user with this ID exists",
        });
        return;
    }

    res.status(200).json({
        msg: "Success",
        data: { items: user.cartJson(), ...user.cartTotal() },
    });
});

const cartRouter = express.Router();

cartRouter.post("/:userId", (req, res) => {
    const data = addtocartRequest.safeParse(req.body);
    if (data.error) {
        res.status(400).json({ status: 400, msg: "Invalid arguments" });
        return;
    }

    const user = User.byId(+req.params.userId);
    if (!user) {
        res.status(404).json({
            status: 404,
            msg: "No user with this ID exists",
        });
        return;
    }

    const product = products.find((p) => p.id === data.data.productId);
    if (!product) {
        res.status(404).json({ status: 404, msg: "Product not found" });
        return;
    }

    const item = user.cart.find((item) => item.product === product);
    if (item) {
        item.quantity++;
    } else {
        user.cart.push({
            product,
            quantity: data.data.quantity,
            id: ++user.cartId,
        });
    }
    res.status(200).json({ msg: "Success", data: user.cartJson() });
});

cartRouter.get("/:userId", (req, res) => {
    const user = User.byId(+req.params.userId);
    if (!user) {
        res.status(404).json({
            status: 404,
            msg: "No user with this ID exists",
        });
        return;
    }

    res.status(200).json({ msg: "Success", data: user.cartJson() });
});

cartRouter.put("/:userId/:itemId", (req, res) => {
    const data = addtocartRequest.safeParse(req.body);
    if (data.error) {
        res.status(400).json({ status: 400, msg: "Invalid arguments" });
        return;
    }

    const user = User.byId(+req.params.userId);
    if (!user) {
        res.status(404).json({
            status: 404,
            msg: "No user with this ID exists",
        });
        return;
    }

    const product = products.find((p) => p.id === data.data.productId);
    if (!product) {
        res.status(404).json({ status: 404, msg: "Product not found" });
        return;
    }

    const item = user.cart.find((item) => item.id === +req.params.itemId);
    if (!item) {
        res.status(404).json({ status: 404, msg: "Item does not exist" });
        return;
    }

    item.product = product;
    item.quantity = data.data.quantity;
    res.status(200).json({ msg: "Success", data: user.cartJson() });
});

cartRouter.delete("/:userId/:itemId", (req, res) => {
    const user = User.byId(+req.params.userId);
    if (!user) {
        res.status(404).json({
            status: 404,
            msg: "No user with this ID exists",
        });
        return;
    }

    const itemIndex = user.cart.findIndex(
        (item) => item.id === +req.params.itemId
    );
    if (itemIndex === -1) {
        res.status(404).json({ status: 404, msg: "Item does not exist" });
        return;
    }

    user.cart.splice(itemIndex, 1);
    res.status(200).json({ msg: "Success", data: user.cartJson() });
});

const ordersRouter = express.Router();

ordersRouter.post("/:userId", (req, res) => {
    const data = placeOrderRequest.safeParse(req.body);
    if (data.error) {
        res.status(400).json({ status: 400, msg: "Invalid arguments" });
        return;
    }

    const user = User.byId(+req.params.userId);
    if (!user) {
        res.status(404).json({
            status: 404,
            msg: "No user with this ID exists",
        });
        return;
    }

    if (!user.cart.length) {
        res.status(400).json({ status: 400, msg: "Cart is empty" });
        return;
    }

    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0"); // Months are 0-based
    const day = String(date.getDate()).padStart(2, "0");

    const { total } = user.cartTotal();
    user.orders.push({
        id: user.orders.length + 1,
        total,
        date: `${year}-${month}-${day}`,
        status: "Pending",
        cart: user.cart,
    });
    user.cart = [];

    res.status(200).json({
        msg: "Success",
        data: { id: user.orders.at(-1)!.id },
    });
});

ordersRouter.get("/:userId", (req, res) => {
    const userId = +req.params.userId;
    const user = User.byId(userId);
    if (!user) {
        res.status(404).json({
            status: 404,
            msg: "No user with this ID exists",
        });
        return;
    }

    res.status(200).json({
        msg: "Success",
        data: user.orders.map((order) => ({
            id: order.id,
            orderDate: order.date,
            status: order.status,
            totalAmount: order.total,
            userId,
            items: order.cart.map((item) => ({
                id: item.id,
                orderId: order.id,
                price: item.product.price,
                productId: item.product.id,
                productName: item.product.title,
                quantity: item.quantity,
                userId,
            })),
        })),
    });
});

router.use("/cart", cartRouter);
router.use("/orders", ordersRouter);

app.use(express.json());
app.use("/v1", router);

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Starting server on port ${port}...`));
