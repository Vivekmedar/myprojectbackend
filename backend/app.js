const express = require('express');
const app = express();
require('dotenv').config();
let PORT = process.env.PORT || 8000;
const mongoose = require('mongoose');
const { User } = require('./models/User');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const morgan = require('morgan');
const { Product } = require('./models/Product');
const { Cart } = require('./models/Cart');

// Middleware
app.use(express.json());
app.use(cors());
app.use(morgan("dev"));

// Log MongoDB URL
console.log("MongoDB URL:", process.env.MONGODB_URL);

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URL)
    .then(() => {
        console.log("DB is connected");
    }).catch((error) => {
        console.error("DB is not connected", error);
    });

// Routes
app.post('/register', async (req, res) => {
    try {
        const { email, password, name } = req.body;

        if (!email || !password || !name) {
            return res.status(400).json({ message: "Some fields are missing" });
        }

        const isUserAlreadyExist = await User.findOne({ email });

        if (isUserAlreadyExist) {
            return res.status(400).json({ message: "User already has an account" });
        }

        const salt = bcrypt.genSaltSync(10);
        const hashedPassword = bcrypt.hashSync(password, salt);
        const token = jwt.sign({ email }, "supersecret", { expiresIn: "365d" });

        await User.create({
            name,
            email,
            password: hashedPassword,
            token,
            role: "user",
        });

        return res.status(201).json({ message: "User created successfully" });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Internal Server Error" });
    }
});

app.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ message: "Email and Password are required" });
        }

        const user = await User.findOne({ email });

        if (!user) {
            return res.status(400).json({ message: "User is not registered. Please register first." });
        }

        const isPasswordMatched = bcrypt.compareSync(password, user.password);

        if (!isPasswordMatched) {
            return res.status(400).json({ message: "Password not matched" });
        }

        return res.status(200).json({
            id: user._id,
            name: user.name,
            token: user.token,
            email: user.email,
            role: user.role,
        });
    } catch (error) {
        console.error("Error during login:", error);
        return res.status(500).json({ message: "Internal Server Error" });
    }
});

app.get('/products', async (req, res) => {
    try {
        const products = await Product.find();
        res.status(200).json({ products });
    } catch (error) {
        return res.status(500).json({ message: "Internal Server Error" });
    }
});

app.post('/add-product', async (req, res) => {
    try {
        const { name, description, image, price, brand, stock } = req.body;
        const { token } = req.headers;
        const decodedtoken = jwt.verify(token, "supersecret");
        const user = await User.findOne({ email: decodedtoken.email });

        await Product.create({
            name,
            description,
            image,
            stock,
            brand,
            price,
            user: user._id,
        });

        res.status(201).json({ message: "Product Created Successfully" });
    } catch (error) {
        console.log(error);
        return res.status(500).json({ message: "Internal Server Error" });
    }
});

app.get('/product/:id', async (req, res) => {
    try {
        const { id } = req.params;
        if (!id) {
            return res.status(400).json({ message: "Product Id not found" });
        }

        const { token } = req.headers;
        const userEmailFromToken = jwt.verify(token, "supersecret");

        if (userEmailFromToken.email) {
            const product = await Product.findById(id);

            if (!product) {
                return res.status(400).json({ message: "Product not found" });
            }

            return res.status(200).json({ message: "success", product });
        }
    } catch (error) {
        console.log(error);
        return res.status(500).json({ message: "Internal server error" });
    }
});

app.patch("/product/edit/:id", async (req, res) => {
    const { id } = req.params;
    const { token } = req.headers;
    const { name, description, image, price, brand, stock } = req.body.productData;
    const userEmail = jwt.verify(token, "supersecret");

    try {
        if (userEmail.email) {
            await Product.findByIdAndUpdate(id, {
                name,
                description,
                image,
                price,
                brand,
                stock,
            });
            return res.status(200).json({ message: "Product Updated Successfully" });
        }
    } catch (error) {
        return res.status(400).json({ message: "Internal Server Error Occurred While Updating Product" });
    }
});

app.delete("/product/delete/:id", async (req, res) => {
    try {
        const { id } = req.params;
        if (!id) {
            return res.status(400).json({ message: "Product ID not found" });
        }

        const deleteProduct = await Product.findByIdAndDelete(id);

        if (!deleteProduct) {
            return res.status(404).json({ message: "Product not found" });
        }

        return res.status(200).json({ message: "Product deleted successfully", product: deleteProduct });
    } catch (error) {
        console.log(error);
        return res.status(500).json({ message: "Error deleting product", error });
    }
});

app.get('/product/search/:keyword', async (req, res) => {
    const { keyword } = req.params;
    try {
        const products = await Product.find({ name: { $regex: keyword, $options: "i" } });

        if (products.length === 0) {
            return res.status(404).json({ message: "No Product Found" });
        }

        return res.status(200).json({ message: "Products found", products });
    } catch (error) {
        console.log(error);
        return res.status(500).json({ message: "Error searching products", error });
    }
});

app.get('/cart', async (req, res) => {
    const { token } = req.headers;
    const decodedtoken = jwt.verify(token, "supersecret");
    const user = await User.findOne({ email: decodedtoken.email }).populate({
        path: 'cart',
        populate: {
            path: 'products',
            model: 'Product'
        }
    });

    if (!user) {
        return res.status(400).json({ message: "User not found" });
    }

    return res.status(200).json({ cart: user.cart });
});

app.post("/cart/add", async (req, res) => {
    const { products } = req.body;
    let totalPrice = 0;

    try {
        for (const item of products) {
            const product = await Product.findById(item);
            if (product) {
                totalPrice += product.price;
            }
        }

        const { token } = req.headers;
        const decodedToken = jwt.verify(token, "supersecret");
        const user = await User.findOne({ email: decodedToken.email });

        if (!user) {
            return res.status(404).json({ message: "User Not Found" });
        }

        let cart;
        if (user.cart) {
            cart = await Cart.findById(user.cart).populate("products");
            const existingProductIds = cart.products.map(product => product._id.toString());

            products.forEach(async productId => {
                if (!existingProductIds.includes(productId)) {
                    cart.products.push(productId);
                    const product = await Product.findById(productId);
                    totalPrice += product.price;
                }
            });

            cart.total = totalPrice;
            await cart.save();
        } else {
            cart = new Cart({
                products,
                total: totalPrice,
            });

            await cart.save();
            user.cart = cart._id;
            await user.save();
        }

        return res.status(201).json({ message: "Cart Updated Successfully", cart });
    } catch (error) {
        return res.status(500).json({ message: "Error Adding to Cart", error });
    }
});

app.delete("/cart/product/delete", async (req, res) => {
    const { productID } = req.body;
    const { token } = req.headers;

    try {
        const decodedToken = jwt.verify(token, "supersecret");
        const user = await User.findOne({ email: decodedToken.email }).populate("cart");

        if (!user) {
            return res.status(404).json({ message: "User Not Found" });
        }

        const cart = await Cart.findById(user.cart).populate("products");

        if (!cart) {
            return res.status(404).json({ message: "Cart Not Found" });
        }

        const productIndex = cart.products.findIndex(product => product._id.toString() === productID);

        if (productIndex === -1) {
            return res.status(404).json({ message: "Product Not Found in Cart" });
        }

        cart.products.splice(productIndex, 1);
        cart.total = cart.products.reduce((total, product) => total + product.price, 0);
        await cart.save();

        return res.status(200).json({ message: "Product Removed from Cart Successfully", cart });
    } catch (error) {
        return res.status(500).json({ message: "Error Removing Product from Cart", error });
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});